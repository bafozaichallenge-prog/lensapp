/*------------------------------------------------------------------------
    Interface: IBusinessRule
    Purpose:   Common contract implemented by every individual business
              rule class so the ContractValidator can execute them
              polymorphically without knowing concrete rule types
              (Section 15, Section 44).

    Requirements:  Section 5 (BRULE-*), Section 44 - Polymorphism
------------------------------------------------------------------------*/

USING domain.entities.Contract.
USING domain.validation.ValidationResult.

INTERFACE domain.interfaces.IBusinessRule:

    METHOD PUBLIC CHARACTER GetRuleCode ( ).

    METHOD PUBLIC CHARACTER GetDescription ( ).

    /* Traces this rule back to the business requirement it implements,
       e.g. "BR-002" - Section 46, Requirements Traceability. */
    METHOD PUBLIC CHARACTER GetRequirementId ( ).

    METHOD PUBLIC ValidationResult Evaluate (INPUT poContract AS Contract).

END INTERFACE.
