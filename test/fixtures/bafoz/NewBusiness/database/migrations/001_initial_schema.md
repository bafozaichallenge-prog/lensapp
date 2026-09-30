# Migration 001 - Initial Schema

Applies `database/schema/newbusiness.df` to a fresh OpenEdge database.

```
prodb newbusiness empty
proutil newbusiness -C LOAD-DF database/schema/newbusiness.df
```

Followed by seed data (Section 52):

```
mpro newbusiness -p database/seed/SeedData.p
```

Future migrations should be added as `NNN_description.df` (or `.p` for
data-only changes) in this folder, numbered sequentially, so the order
they must be applied in is unambiguous.
