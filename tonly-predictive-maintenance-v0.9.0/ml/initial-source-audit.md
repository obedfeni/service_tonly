# Initial source-data audit — TONLY charging log

**Input reviewed:** `/mnt/data/Pasted text.txt`  
**Audit date:** 2026-10-15  
**Important:** This is a first-pass automated audit. It is not a maintenance approval or a final data-cleaning decision.

## Summary

- Rows parsed: **4,254**
- Rows currently classified good: **3,975**
- Rows flagged for review: **274**
- Rows rejected due to critical missing/invalid fields: **5**
- Distinct raw truck ID strings: **44** (the expected fleet scope is 30)
- Parsed date range: **2026-08-15 to 2065-08-18**

## Flag counts

- `odometer_decreased`: **245**
- `future_date_review`: **43**
- `truck_id_format_review`: **11**
- `duplicate_candidate`: **5**
- `invalid_odometer`: **4**
- `invalid_date`: **1**


## Recommended review order

1. **Date anomaly:** inspect the record(s) parsed in year 2065. Confirm whether this is a typo or date-format problem; do not silently replace it.
2. **Truck identifier mapping:** the raw log contains variants such as `ET01`, `ET001`, and `ET0O2`. Confirm the authoritative 30-truck list before mapping variants. `ET0O2` contains the letter O and may be a transcription error, but it must be confirmed by a human.
3. **Odometer decreases:** 245 rows are flagged where the odometer is lower than the previous chronological reading for that raw ID. Some may be ID mismatches, source ordering issues, reset/entry errors or data errors. Review by truck and date.
4. **Duplicate candidates:** inspect the 5 rows with matching date, truck, odometer and start-time fingerprints before excluding them.
5. **Invalid fields:** review the 4 invalid odometer values and 1 invalid date.
6. **Maintenance baseline:** add verified last-service date and odometer per truck and service type, plus OEM-approved kilometre and calendar intervals. The current charging log alone cannot establish these.

## Safe modelling rule

Do not train or publish a production model from the current data as-is. The dashboard prototype uses illustrative values and illustrative service rules; the source data is not yet connected. Keep original rows, flags, human review decisions and import batch identifiers so that every correction is traceable.
