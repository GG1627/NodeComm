"""
Setup script for SynapseNet backend.
"""

from setuptools import setup, find_packages

setup(
    name="synapsenet-backend",
    version="0.1.0",
    description="Interactive 3D Hardware Atlas & Chaos Survival Challenge - Backend",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.9",
    install_requires=[
        "pydantic>=2.0.0",
        "numpy>=1.24.0", 
        "fastapi>=0.100.0",
        "uvicorn[standard]>=0.23.0",
        "scikit-learn>=1.3.0",
        "python-dotenv>=1.0.0",
        "orjson>=3.9.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
        ]
    },
)
