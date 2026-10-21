# Order Lifecycle (sample)

1. **Created** - order captured against a customer.
2. **Credit check** - `GetCustomerCreditStatus` is called (policy CR-1).
3. **Held** - set by `PlaceOrderHold` when credit or compliance fails.
4. **Allocated** - stock reserved.
5. **Shipped** - terminal state, immutable (policy CR-5).

Tables involved (sports2020): `Customer`, `Order`, `OrderLine`, `Item`.
