import torch.nn as nn
import numpy as np
import torch
import torch.nn.functional as F
from torch_geometric.nn import GATConv
from torch_geometric.data import Data
import sys
import json



class gatRecommer(nn.Module):    
    def __init__(self, in_channels, hidden=64, out=32, heads=4, dropout=0.3):
        super().__init__()
        self.conv1 = GATConv(in_channels, hidden, heads=heads, dropout=dropout)
        self.conv2 = GATConv(hidden * heads, hidden, heads=heads, dropout=dropout)
        self.conv3 = GATConv(hidden * heads, out, heads=1, dropout=dropout)
        self.norm1 = nn.LayerNorm(hidden * heads)
        self.norm2 = nn.LayerNorm(hidden * heads)
        self.dropout = dropout
        
        self.link_predictor = nn.Sequential(
            nn.Linear(out * 2, 64), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(64, 32), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(32, 1), nn.Sigmoid()
        )
    
    def forward(self, x, edge_index):
        x = F.elu(self.norm1(self.conv1(x, edge_index)))
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = F.elu(self.norm2(self.conv2(x, edge_index)))
        x = F.dropout(x, p=self.dropout, training=self.training)
        return self.conv3(x, edge_index)
    
    def predictL(self, z, edge_index):
        edge_emb = torch.cat([z[edge_index[0]], z[edge_index[1]]], dim=1)
        return self.link_predictor(edge_emb).squeeze()


def normalizer(features):
    features = np.array(features, dtype=np.float32)
    mean, std = features.mean(axis=0), features.std(axis=0)
    std[std == 0] = 1
    return (features - mean) / std, mean, std


def negSamples(num_users, pos_edges, num_neg):
    pos_set = set(  (min(pos_edges[0, i], pos_edges[1, i]), max(pos_edges[0, i], pos_edges[1, i]))  for i in range(pos_edges.shape[1]))
    neg_edges = []
    while len(neg_edges) < num_neg:
        src, dst = np.random.randint(0, num_users, 2)
        if src != dst and (min(src, dst), max(src, dst)) not in pos_set:
            neg_edges.append([src, dst])
    return torch.tensor(neg_edges, dtype=torch.long).t()


def train_model(data_path, model_path, epochs=100):
    with open(data_path, 'r') as f:
        data = json.load(f)
    
    features = data['features']
    edges = data['edges']

    # Prepare data
    norm_feat, mean, std = normalizer(features)
    x = torch.tensor(norm_feat, dtype=torch.float)
    edge_list = edges + [[e[1], e[0]] for e in edges]
    edge_index = torch.tensor(edge_list, dtype=torch.long).t() if edge_list else torch.empty((2, 0), dtype=torch.long)
    graph_data = Data(x=x, edge_index=edge_index)
    

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = gatRecommer(x.size(1)).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=5e-4)

    # print(device)
    model.train()
    num_pos = edge_index.size(1) // 2
    
    for epoch in range(epochs):
        optimizer.zero_grad()
        z = model(graph_data.x.to(device), graph_data.edge_index.to(device))
        pos_edges = edge_index[:, :num_pos].to(device)
        neg_edges = negSamples(x.size(0), edge_index, num_pos).to(device)
        

        pos_pred = model.predictL(z, pos_edges)
        neg_pred = model.predictL(z, neg_edges)
        
        loss = F.binary_cross_entropy(pos_pred, torch.ones_like(pos_pred)) +  F.binary_cross_entropy(neg_pred, torch.zeros_like(neg_pred))
        
        loss.backward()
        optimizer.step()
        
        if (epoch + 1) % 10 == 0:
            print(f'Epoch {epoch+1}/{epochs}, Loss: {loss.item():.4f}')
    
    torch.save({
        'model_state_dict': model.state_dict(),
        'feature_mean': mean.tolist(),
        'feature_std': std.tolist(),
        'num_features': x.size(1)
    }, model_path)

    print(f"saved {model_path}")


def get_recommendations(data_path, model_path):
    with open(data_path, 'r') as f:
        data = json.load(f)
    
    cp = torch.load(model_path, map_location='cpu')
    features = np.array(data['features'], dtype=np.float32)
    norm_feat = (features - np.array(cp['feature_mean'])) / np.array(cp['feature_std'])
    
    x = torch.tensor(norm_feat, dtype=torch.float)
    edge_list = data['edges'] + [[e[1], e[0]] for e in data['edges']]
    edge_index = torch.tensor(edge_list, dtype=torch.long).t() if edge_list else torch.empty((2, 0), dtype=torch.long)
    
    user_to_idx = {u['id']: idx for idx, u in enumerate(data['users'])}
    target_idx = user_to_idx.get(data['targetUs'])
    
    if target_idx is None:
        return json.dumps({'error': 'User not found'})
    
    # Existing friends
    existing = set(edge_index[1, edge_index[0] == target_idx].tolist())
    
    # Load model and predict
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = gatRecommer(cp['num_features']).to(device)
    model.load_state_dict(cp['model_state_dict'])
    model.eval()
    
    with torch.no_grad():
        z = model(x.to(device), edge_index.to(device))
        scores = []
        for idx, user in enumerate(data['users']):
            if idx == target_idx or idx in existing:
                continue
            edge = torch.tensor([[target_idx], [idx]], dtype=torch.long).to(device)
            score = model.predictL(z, edge).item()
            scores.append({
                'userId': user['id'], 'username': user['username'], 'avatar': user.get('avatar', ''), 'bio': user.get('bio', ''),
                    'score': float(score)
            })
        
        scores.sort(key=lambda x: x['score'], reverse=True)
    
    return json.dumps({
        'recomms': scores[:data['topK']],
        'targetUs': data['targetUs'],
        'allCands': len(scores)
    })


if __name__ == '__main__':

    mode, data_path, model_path = sys.argv[1], sys.argv[2], sys.argv[3]
    
    try:
        if mode == 'train':
            train_model(data_path, model_path)
        elif mode == 'infer':
            print(get_recommendations(data_path, model_path))
        else:
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
