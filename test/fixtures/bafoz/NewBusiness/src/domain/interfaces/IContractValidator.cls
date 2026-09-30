/*------------------------------------------------------------------------
    Interface: IContractValidator
    Purpose:   Abstraction for anything capable of running the full set
               of new-business validation rules against a Contract and
               returning a structured ValidationSummary.

    Requirements:  Section 6 (BR-006), Section 14, Section 20
------------------------------------------------------------------------*/

USING domain.entities.Contract.
USING domain.validation.ValidationSummary.

INTERFACE domain.interfaces.IContractValidator:

    METHOD PUBLIC ValidationSummary ValidateContract (INPUT poContract AS Contract).

END INTERFACE.
