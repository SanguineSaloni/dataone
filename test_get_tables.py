import sys
import json
sys.path.append("/Users/salonisidheshwar/Desktop/dataone/DataOne-main 2/backend")

import os
import requests

from app.connectors.databricks_connector import DatabricksConnector

def run():
    client_id = os.environ.get("DATABRICKS_CLIENT_ID")
    client_secret = os.environ.get("DATABRICKS_CLIENT_SECRET")
    
    # We need to simulate the env or just fetch token manually like we do in databricks_connector
    # We'll just pass the client_id/secret if they exist in env, but since we are running locally 
    # we might not have them. Let's see if we can get a connection from the DB.
    
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.database import SessionLocal
    from app.models.db_connection import DBConnection
    
    db = SessionLocal()
    # Find the Databricks connection
    conn = db.query(DBConnection).filter(DBConnection.type == "databricks").first()
    if not conn:
        print("No databricks connection found in DB")
        return
        
    print(f"Connection ID: {conn.id}")
    print(f"Config: {conn.config}")
    
    # Initialize connector
    connector = DatabricksConnector(
        server_hostname=conn.config.get("server_hostname"),
        http_path=conn.config.get("http_path"),
        access_token=conn.config.get("access_token"),
        catalog=conn.config.get("catalog"),
        schema=conn.config.get("schema")
    )
    
    try:
        tables = connector.get_tables()
        print(f"Found {len(tables)} tables:")
        print(tables)
    except Exception as e:
        print(f"Error fetching tables: {e}")

if __name__ == "__main__":
    run()
