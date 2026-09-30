# Migration 003 - Contract sequence

Applies `database/delta/003_contract_sequence.df`.

```
proutil newbusiness -C LOAD-DF database/delta/003_contract_sequence.df
```

If migrating a database that already contains Contract rows, set the
sequence past the highest existing number first:

```
/* set sequence to N via Data Administration or: */
CURRENT-VALUE(SeqContract) = <highest existing number>.
```
