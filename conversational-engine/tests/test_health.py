import os

from fastapi.testclient import TestClient

os.environ.setdefault('CONVERSATIONAL_ENGINE_MONGO_URI', 'mongodb://localhost:27017')

from conversational_engine.app.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok():
    response = client.get('/health')

    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['service'] == 'conversational-engine'
