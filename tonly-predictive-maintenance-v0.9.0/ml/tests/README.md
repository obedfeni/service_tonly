# Pipeline regression tests

From the project root, install the dependencies in `ml/requirements.txt` and run:

```bash
python -m pytest ml/tests -q
```

The tests verify that suspicious readings are flagged rather than silently repaired, daily features use observed values only, a missing usage baseline does not generate a forecast date, and quality counts remain consistent.
