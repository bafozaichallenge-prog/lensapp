# Credit & Order Hold Policy (sample)

Sample knowledge document for the RAG demo. Replace with your real policies.

## CR-1 Credit limit
A customer is **on credit hold** when `Customer.Balance` exceeds `Customer.CreditLimit`.
This is evaluated by `Showcase.OrderService:GetCustomerCreditStatus`.

## CR-3 Hold reason is mandatory
Every order hold must carry a free-text reason. `PlaceOrderHold` rejects blank reasons with HTTP 400.

## CR-5 Shipped orders are immutable
An order with status `Shipped` can never be placed on hold. `PlaceOrderHold` returns HTTP 409.

## CR-7 Approval for large holds
Holds on orders above R100 000 should be raised with the credit controller before release.

## FAQ
**Q: Who can release a hold?** The credit controller role only.
**Q: Does a hold affect stock allocation?** Yes, held orders do not allocate stock until released.
