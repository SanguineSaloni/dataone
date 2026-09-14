import inspect
import databricks.sdk.service.jobs as jobs
print("Task parameters:")
for field in jobs.Task.__dataclass_fields__:
    print(field)
print("----------------")
