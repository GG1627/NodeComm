#!/usr/bin/env python3
"""
Train ML models for hardware failure prediction.
Uses the synthetic dataset to train Random Forest classifiers.
"""

import numpy as np
import pandas as pd
import pickle
import argparse
import joblib
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt


class FailurePredictionTrainer:
    """Train ML models for different types of hardware failures"""
    
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.feature_names = [
            'cpu_util', 'cpu_temp', 'gpu_util', 'gpu_temp', 'memory_util',
            'network_latency', 'network_bandwidth', 'network_util', 'power_draw'
        ]
        
        # Time-series features (trends over last 5 samples)
        self.trend_features = [
            'cpu_util_trend', 'cpu_temp_trend', 'gpu_util_trend', 'gpu_temp_trend',
            'network_latency_trend', 'network_util_trend', 'power_trend'
        ]
        
        self.all_features = self.feature_names + self.trend_features
    
    def extract_features(self, df):
        """Extract features including time-series trends"""
        print("🔧 Extracting features...")
        
        # Sort by timestamp
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        features = []
        labels = []
        failure_types = []
        
        # Need at least 5 samples for trend calculation
        for i in range(5, len(df)):
            # Current state features
            current = df.iloc[i]
            feature_vector = [
                current['cpu_util'], current['cpu_temp'], current['gpu_util'],
                current['gpu_temp'], current['memory_util'], current['network_latency'],
                current['network_bandwidth'], current['network_util'], current['power_draw']
            ]
            
            # Trend features (slope over last 5 samples)
            window = df.iloc[i-4:i+1]
            
            # Calculate trends
            cpu_util_trend = np.polyfit(range(5), window['cpu_util'], 1)[0]
            cpu_temp_trend = np.polyfit(range(5), window['cpu_temp'], 1)[0]
            gpu_util_trend = np.polyfit(range(5), window['gpu_util'], 1)[0]
            gpu_temp_trend = np.polyfit(range(5), window['gpu_temp'], 1)[0]
            network_latency_trend = np.polyfit(range(5), window['network_latency'], 1)[0]
            network_util_trend = np.polyfit(range(5), window['network_util'], 1)[0]
            power_trend = np.polyfit(range(5), window['power_draw'], 1)[0]
            
            trend_vector = [
                cpu_util_trend, cpu_temp_trend, gpu_util_trend, gpu_temp_trend,
                network_latency_trend, network_util_trend, power_trend
            ]
            
            feature_vector.extend(trend_vector)
            
            features.append(feature_vector)
            labels.append(current['failure_in_10s'])
            failure_types.append(current['failure_type'])
        
        return np.array(features), np.array(labels), failure_types
    
    def train_binary_classifier(self, X, y, model_name="failure_predictor"):
        """Train binary classifier for failure prediction"""
        print(f"🎯 Training {model_name}...")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        
        # Train Random Forest
        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_train_scaled, y_train)
        
        # Evaluate
        y_pred = model.predict(X_test_scaled)
        accuracy = accuracy_score(y_test, y_pred)
        
        print(f"✅ {model_name} trained!")
        print(f"   Accuracy: {accuracy:.3f}")
        print(f"   Training samples: {len(X_train)}")
        print(f"   Test samples: {len(X_test)}")
        print(f"   Positive samples: {sum(y_train)} train, {sum(y_test)} test")
        
        # Cross-validation
        cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=5)
        print(f"   CV Accuracy: {cv_scores.mean():.3f} (+/- {cv_scores.std() * 2:.3f})")
        
        # Feature importance
        feature_importance = list(zip(self.all_features, model.feature_importances_))
        feature_importance.sort(key=lambda x: x[1], reverse=True)
        
        print(f"   Top 5 features:")
        for feature, importance in feature_importance[:5]:
            print(f"     {feature}: {importance:.3f}")
        
        # Store model and scaler
        self.models[model_name] = model
        self.scalers[model_name] = scaler
        
        return model, scaler, accuracy
    
    def train_multiclass_classifier(self, X, y, failure_types, model_name="failure_type_predictor"):
        """Train multiclass classifier for failure type prediction"""
        print(f"🎯 Training {model_name}...")
        
        # Only train on failure samples
        failure_mask = np.array(y) == True
        X_failures = X[failure_mask]
        failure_type_labels = np.array(failure_types)[failure_mask]
        
        if len(X_failures) == 0:
            print("❌ No failure samples found!")
            return None, None, 0
        
        # Map failure types to numbers
        unique_types = list(set(failure_type_labels))
        type_to_num = {t: i for i, t in enumerate(unique_types)}
        y_types = [type_to_num[t] for t in failure_type_labels]
        
        print(f"   Failure types: {unique_types}")
        print(f"   Samples per type: {pd.Series(failure_type_labels).value_counts().to_dict()}")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_failures, y_types, test_size=0.2, random_state=42, stratify=y_types
        )
        
        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        
        # Train Random Forest
        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=8,
            min_samples_split=3,
            min_samples_leaf=1,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_train_scaled, y_train)
        
        # Evaluate
        y_pred = model.predict(X_test_scaled)
        accuracy = accuracy_score(y_test, y_pred)
        
        print(f"✅ {model_name} trained!")
        print(f"   Accuracy: {accuracy:.3f}")
        print(f"   Training samples: {len(X_train)}")
        print(f"   Test samples: {len(X_test)}")
        
        # Store model, scaler, and type mapping
        self.models[model_name] = model
        self.scalers[model_name] = scaler
        self.models[f"{model_name}_type_mapping"] = {i: t for t, i in type_to_num.items()}
        
        return model, scaler, accuracy
    
    def save_models(self, output_dir):
        """Save trained models and scalers"""
        os.makedirs(output_dir, exist_ok=True)
        
        print(f"💾 Saving models to {output_dir}...")
        
        # Save each model and scaler
        for name, model in self.models.items():
            if not name.endswith('_type_mapping'):
                model_path = os.path.join(output_dir, f"{name}.pkl")
                joblib.dump(model, model_path)
                print(f"   Saved {name} to {model_path}")
        
        for name, scaler in self.scalers.items():
            scaler_path = os.path.join(output_dir, f"{name}_scaler.pkl")
            joblib.dump(scaler, scaler_path)
            print(f"   Saved {name}_scaler to {scaler_path}")
        
        # Save type mapping
        if 'failure_type_predictor_type_mapping' in self.models:
            mapping_path = os.path.join(output_dir, "failure_type_mapping.pkl")
            joblib.dump(self.models['failure_type_predictor_type_mapping'], mapping_path)
            print(f"   Saved type mapping to {mapping_path}")
        
        # Save feature names
        feature_path = os.path.join(output_dir, "feature_names.pkl")
        joblib.dump(self.all_features, feature_path)
        print(f"   Saved feature names to {feature_path}")
        
        print("✅ All models saved!")
    
    def create_model_summary(self, output_dir):
        """Create a summary of trained models"""
        summary_path = os.path.join(output_dir, "model_summary.txt")
        
        with open(summary_path, 'w') as f:
            f.write("SynapseNet ML Models - Training Summary\n")
            f.write("=" * 50 + "\n\n")
            
            f.write("Models trained:\n")
            for name in self.models:
                if not name.endswith('_type_mapping'):
                    f.write(f"  - {name}\n")
            
            f.write(f"\nFeatures used ({len(self.all_features)}):\n")
            for feature in self.all_features:
                f.write(f"  - {feature}\n")
            
            f.write("\nUsage:\n")
            f.write("  from ml_predictor import FailurePredictionML\n")
            f.write("  predictor = FailurePredictionML('models/')\n")
            f.write("  predictions = predictor.predict(telemetry_data)\n")
        
        print(f"📋 Model summary saved to {summary_path}")


def load_dataset(dataset_path):
    """Load the training dataset"""
    print(f"📂 Loading dataset from {dataset_path}...")
    
    with open(dataset_path, 'rb') as f:
        df = pickle.load(f)
    
    print(f"✅ Dataset loaded!")
    print(f"   Total samples: {len(df)}")
    print(f"   Features: {df.columns.tolist()}")
    print(f"   Failure distribution: {df['failure_in_10s'].value_counts().to_dict()}")
    print(f"   Failure types: {df['failure_type'].value_counts().to_dict()}")
    
    return df


def main():
    parser = argparse.ArgumentParser(description='Train ML models for hardware failure prediction')
    parser.add_argument('--dataset', type=str, required=True, help='Path to training dataset')
    parser.add_argument('--output', type=str, default='models', help='Output directory for trained models')
    
    args = parser.parse_args()
    
    # Load dataset
    df = load_dataset(args.dataset)
    
    # Initialize trainer
    trainer = FailurePredictionTrainer()
    
    # Extract features
    X, y, failure_types = trainer.extract_features(df)
    
    print(f"\n🎯 Training ML models...")
    print(f"   Feature matrix shape: {X.shape}")
    print(f"   Positive samples: {sum(y)} ({sum(y)/len(y)*100:.1f}%)")
    
    # Train binary classifier (will failure occur?)
    binary_model, binary_scaler, binary_acc = trainer.train_binary_classifier(X, y)
    
    # Train multiclass classifier (what type of failure?)
    multi_model, multi_scaler, multi_acc = trainer.train_multiclass_classifier(X, y, failure_types)
    
    # Save models
    trainer.save_models(args.output)
    trainer.create_model_summary(args.output)
    
    print(f"\n🎉 Training complete!")
    print(f"   Binary classifier accuracy: {binary_acc:.3f}")
    if multi_model:
        print(f"   Multiclass classifier accuracy: {multi_acc:.3f}")
    print(f"   Models saved to: {args.output}")
    print(f"\n🚀 Ready for real-time prediction!")
    print(f"   Next: python test_ml_predictor.py --models {args.output}")


if __name__ == "__main__":
    main()
