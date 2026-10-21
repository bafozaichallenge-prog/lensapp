/* order-totals.p - calculates order totals and applies customer credit limits */
{include/ordertt.i}

DEFINE INPUT PARAMETER ipCustNum AS INTEGER NO-UNDO.

PROCEDURE calcOrderTotal:
  DEFINE INPUT  PARAMETER ipOrderNum AS INTEGER NO-UNDO.
  DEFINE OUTPUT PARAMETER opTotal    AS DECIMAL NO-UNDO.

  FOR EACH OrderLine NO-LOCK WHERE OrderLine.OrderNum = ipOrderNum:
    opTotal = opTotal + (OrderLine.Qty * OrderLine.Price).
  END.
END PROCEDURE.

PROCEDURE checkCreditLimit:
  DEFINE INPUT  PARAMETER ipCustNum AS INTEGER NO-UNDO.
  DEFINE OUTPUT PARAMETER opOk      AS LOGICAL NO-UNDO.

  FIND FIRST Customer NO-LOCK WHERE Customer.CustNum = ipCustNum NO-ERROR.
  /* Credit limit exceeded -> block the order */
  opOk = AVAILABLE Customer AND Customer.Balance <= Customer.CreditLimit.
  RUN audit-log.p ("credit-check", STRING(ipCustNum)).
END PROCEDURE.

FUNCTION isLargeOrder RETURNS LOGICAL (ipTotal AS DECIMAL):
  RETURN ipTotal > 10000.
END FUNCTION.
