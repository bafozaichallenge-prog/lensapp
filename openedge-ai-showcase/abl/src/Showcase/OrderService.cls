/*------------------------------------------------------------------------
   File        : OrderService.cls
   Purpose     : Business logic exposed as REST on PAS for OpenEdge. The
                 OpenEdge MCP Server turns each exposed operation into an
                 MCP "tool" so an AI agent calls THIS logic (credit checks,
                 validation, audit) instead of touching the database.
   Database    : sports2020 (shipped with OpenEdge)
   Note        : Annotation syntax follows the PDSOE REST service wizard
                 output; regenerate via PDSOE if your version differs.
  ----------------------------------------------------------------------*/
USING Progress.Lang.*.
USING Progress.Json.ObjectModel.*.

BLOCK-LEVEL ON ERROR UNDO, THROW.

CLASS Showcase.OrderService:

    /* Tool: get_customer_credit_status */
    @openapi.openedge.export(type="REST", useReturnValue="false", writeDataSetBeforeImage="false").
    METHOD PUBLIC VOID GetCustomerCreditStatus(
            INPUT  piCustNum    AS INTEGER,
            OUTPUT pcName       AS CHARACTER,
            OUTPUT pdBalance    AS DECIMAL,
            OUTPUT pdCreditLimit AS DECIMAL,
            OUTPUT plOnHold     AS LOGICAL):

        FIND Customer NO-LOCK WHERE Customer.CustNum = piCustNum NO-ERROR.
        IF NOT AVAILABLE Customer THEN
            UNDO, THROW NEW AppError(SUBSTITUTE("Customer &1 not found", piCustNum), 404).

        ASSIGN pcName        = Customer.Name
               pdBalance     = Customer.Balance
               pdCreditLimit = Customer.CreditLimit
               plOnHold      = Customer.Balance > Customer.CreditLimit.
    END METHOD.

    /* Tool: list_open_orders */
    @openapi.openedge.export(type="REST", useReturnValue="false", writeDataSetBeforeImage="false").
    METHOD PUBLIC VOID ListOpenOrders(
            INPUT  piCustNum AS INTEGER,
            OUTPUT pcOrders  AS LONGCHAR):

        DEFINE VARIABLE oArr AS JsonArray  NO-UNDO.
        DEFINE VARIABLE oRow AS JsonObject NO-UNDO.

        oArr = NEW JsonArray().
        FOR EACH Order NO-LOCK
            WHERE Order.CustNum = piCustNum
              AND Order.OrderStatus <> "Shipped":
            oRow = NEW JsonObject().
            oRow:Add("orderNum",  Order.OrderNum).
            oRow:Add("orderDate", Order.OrderDate).
            oRow:Add("status",    Order.OrderStatus).
            oArr:Add(oRow).
        END.
        pcOrders = oArr:GetJsonText().
    END METHOD.

    /* Tool: place_order_hold - a WRITE operation, so it is audited and
       guarded by business rules (see rag/knowledge/credit-policy.md). */
    @openapi.openedge.export(type="REST", useReturnValue="false", writeDataSetBeforeImage="false").
    METHOD PUBLIC VOID PlaceOrderHold(
            INPUT  piOrderNum AS INTEGER,
            INPUT  pcReason   AS CHARACTER,
            OUTPUT plOk       AS LOGICAL):

        IF pcReason = "" OR pcReason = ? THEN
            UNDO, THROW NEW AppError("A hold reason is mandatory (policy CR-3)", 400).

        DO TRANSACTION:
            FIND Order EXCLUSIVE-LOCK WHERE Order.OrderNum = piOrderNum NO-ERROR.
            IF NOT AVAILABLE Order THEN
                UNDO, THROW NEW AppError(SUBSTITUTE("Order &1 not found", piOrderNum), 404).
            IF Order.OrderStatus = "Shipped" THEN
                UNDO, THROW NEW AppError("Shipped orders cannot be held (policy CR-5)", 409).

            Order.OrderStatus = "Held".
            Order.Instructions = SUBSTITUTE("HOLD: &1 (&2)", pcReason, ISO-DATE(NOW)).
        END.
        plOk = TRUE.
    END METHOD.

END CLASS.
