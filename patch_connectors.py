import re

with open('backend/app/api/routers/connectors.py', 'r') as f:
    content = f.read()

old_trigger = '''            logger.info(f"Automatically triggering Databricks pipeline for new connector {created.id}")
            DatabricksIngestionService.trigger_ingestion(
                source_connection_id=created.id,
                target_connection_id=None,
                target_catalog="workspace",
                target_schema="default",
                db=db,
                actor=_actor(user)
            )'''

new_trigger = '''            logger.info(f"Automatically setting up Databricks Lakehouse Federation for new connector {created.id}")
            DatabricksIngestionService.setup_lakehouse_federation(
                source_conn=created,
                actor=_actor(user)
            )'''

content = content.replace(old_trigger, new_trigger)

# Also check if it was using "main" and "dataone_ingested" instead of "workspace" and "default" since we changed it earlier
old_trigger_fallback = '''            logger.info(f"Automatically triggering Databricks pipeline for new connector {created.id}")
            DatabricksIngestionService.trigger_ingestion(
                source_connection_id=created.id,
                target_connection_id=None,
                target_catalog="main",
                target_schema="dataone_ingested",
                db=db,
                actor=_actor(user)
            )'''
content = content.replace(old_trigger_fallback, new_trigger)

with open('backend/app/api/routers/connectors.py', 'w') as f:
    f.write(content)
