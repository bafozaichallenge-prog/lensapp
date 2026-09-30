/*------------------------------------------------------------------------
    Rule:          PersonMandatoryDetailsRule
    Rule Code:     NB-PERSON-002
    Requirement:   BR-003 / BRULE-003
    Description:   The contract owner must have all mandatory personal
                   details captured (FirstName, Surname, DateOfBirth,
                   IDNumber, MobileNumber). Delegates the actual field
                   check to Person:ValidateMandatoryDetails() so the
                   rule and the entity never drift out of sync.
------------------------------------------------------------------------*/

USING domain.rules.AbstractBusinessRule.
USING domain.entities.Contract.
USING domain.entities.Person.
USING domain.interfaces.IPersonRepository.
USING domain.validation.ValidationResult.

CLASS domain.rules.PersonMandatoryDetailsRule INHERITS AbstractBusinessRule:

    DEFINE PRIVATE VARIABLE moPersonRepository AS IPersonRepository NO-UNDO.

    CONSTRUCTOR PUBLIC PersonMandatoryDetailsRule (INPUT poPersonRepository AS IPersonRepository):
        SUPER("NB-PERSON-002",
              "The contract owner is missing mandatory personal details.",
              "BR-003",
              ValidationResult:SEVERITY_ERROR).
        moPersonRepository = poPersonRepository.
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE ValidationResult Evaluate (INPUT poContract AS Contract):
        DEFINE VARIABLE oPerson        AS Person    NO-UNDO.
        DEFINE VARIABLE cMissingFields AS CHARACTER NO-UNDO.

        /* This rule only judges completeness of the owner's details;
           whether an owner is linked at all is ContractOwnerRequiredRule's
           job, so an absent owner is simply not-applicable here. */
        IF poContract:OwnerPersonId = "" OR poContract:OwnerPersonId = ? THEN
            RETURN THIS-OBJECT:CreateSuccessResult().

        IF NOT moPersonRepository:Exists(poContract:OwnerPersonId) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Owner person &1 could not be found.", poContract:OwnerPersonId),
                "OwnerPersonId").

        oPerson = moPersonRepository:GetById(poContract:OwnerPersonId).

        IF NOT oPerson:ValidateMandatoryDetails(OUTPUT cMissingFields) THEN
            RETURN THIS-OBJECT:CreateFailureResult(
                SUBSTITUTE("Owner is missing mandatory details: &1.", cMissingFields),
                "Person").

        RETURN THIS-OBJECT:CreateSuccessResult().
    END METHOD.

END CLASS.
