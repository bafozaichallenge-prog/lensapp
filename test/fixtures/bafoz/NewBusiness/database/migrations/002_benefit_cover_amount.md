# Migration 002 - Benefit.CoverAmount

Applies `database/delta/002_benefit_cover_amount.df`.

```
proutil newbusiness -C LOAD-DF database/delta/002_benefit_cover_amount.df
```

Existing Benefit rows receive `CoverAmount = 0` (field INITIAL).
Repopulate defaults afterwards if required, e.g.:

```
mpro newbusiness -p database/seed/SeedData.p   (re-run for mock envs)
```
