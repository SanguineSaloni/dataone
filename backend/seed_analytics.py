from app.core.database import SessionLocal, engine, Base
from app.models.analytics import AnalyticsMetric

Base.metadata.create_all(bind=engine)

db = SessionLocal()
metrics = [
    ("migrations_performed", 14.0),
    ("data_visualizations_created", 42.0),
    ("times_saved_hours", 312.5)
]
for k, v in metrics:
    if not db.query(AnalyticsMetric).filter_by(metric_key=k).first():
        db.add(AnalyticsMetric(metric_key=k, metric_value=v))
db.commit()
db.close()
