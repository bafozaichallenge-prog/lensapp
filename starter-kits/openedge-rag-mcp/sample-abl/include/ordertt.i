/* ordertt.i - shared order temp-table */
DEFINE TEMP-TABLE ttOrder NO-UNDO
  FIELD order-num AS INTEGER
  FIELD cust-num  AS INTEGER
  FIELD total     AS DECIMAL.
