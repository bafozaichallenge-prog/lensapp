/*------------------------------------------------------------------------
    Rule:          DuplicateContractRule
    Rule Code:     NB-CONTRACT-002
    Requirement:   BR-006
    Description:   No duplicate active contract may exist for the same
                   owner where prohibited - Edge Cases: "Client already
                   has an active policy", "Client has multiple existing
                   policies".
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.interfaces.IContractRepository.
USING domain.validation.ValidationResult.

CLASS domain.rules.DuplicateContractRule INHERITS AbstractBusinessRule:

    DEFINE PRIVATE VARIABLE moContractRepository AS IContractRepository NO-UNDO.

    CONSTRUCTOR PUBLIC DuplicateContractRule (INPUT poContractRepository AS IContractRepository):
        SUPER("NB-CONTRACT-002",
              "The owner already has an active contract.",
              "BR-006",
              ValidationResult:SEVERITY_ERROR).
        moContractRepository = poContractRepository.
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        IF poContract:OwnerPersonId = "" OR poContract:OwnerPersonId = ? THEN
            RETURN THIS-OBJECT:CreateSuccessResult(). /* ContractOwnerRequiredRule reports this */

        IF moContractRepository:HasActiveContractForOwner(poContract:OwnerPersonId) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Owner &1 already has an active contract.", poContract:OwnerPersonId),
                "OwnerPersonId").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
