from app.core.database import SessionLocal
from app.models.connection import DBConnection
import sys

db = SessionLocal()
conns = db.query(DBConnection).all()
for c in conns:
    print(f"ID: {c.id}, Name: {c.name}, Type: {c.type}, Host: {c.config.get('host')}, DB: {c.config.get('dbname')}")
