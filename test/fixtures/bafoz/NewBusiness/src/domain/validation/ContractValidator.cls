/*------------------------------------------------------------------------
    Class:    ContractValidator
    Purpose:  Executes every registered IBusinessRule against a Contract
              and assembles the results into a ValidationSummary. Rules
              are executed polymorphically - the validator never checks
              concrete rule types (Section 20, Section 44).

    Requirements:  BR-006 - Validate New Business, Section 20
------------------------------------------------------------------------*/

USING domain.interfaces.IContractValidator.
USING domain.interfaces.IBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationSummary.
USING domain.rules.BusinessRuleRegistry.
USING infrastructure.logging.ILogger.
USING OpenEdge.Core.Collections.ArrayList.

CLASS domain.validation.ContractValidator IMPLEMENTS IContractValidator:

    DEFINE PRIVATE VARIABLE moRegistry AS BusinessRuleRegistry NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger   AS ILogger              NO-UNDO.

    CONSTRUCTOR PUBLIC ContractValidator (INPUT poRegistry AS BusinessRuleRegistry, INPUT poLogger AS ILogger):
        moRegistry = poRegistry.
        moLogger   = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC ValidationSummary ValidateContract (INPUT poContract AS Contract):
        DEFINE VARIABLE oSummary AS ValidationSummary NO-UNDO.
        DEFINE VARIABLE oRules   AS ArrayList          NO-UNDO.
        DEFINE VARIABLE oRule    AS IBusinessRule      NO-UNDO.
        DEFINE VARIABLE i        AS INTEGER            NO-UNDO.

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("ContractValidator", SUBSTITUTE("Validation started for &1", poContract:ContractId)).

        oSummary = NEW ValidationSummary().
        oRules   = moRegistry:GetRules().

        DO i = 1 TO oRules:Size:
            oRule = CAST(oRules:Get(i), IBusinessRule).
            oSummary:AddResult(oRule:Evaluate(poContract)).
        END.

        IF VALID-OBJECT(moLogger) THEN DO:
            IF oSummary:IsValid() THEN
                moLogger:LogInfo("ContractValidator", SUBSTITUTE("Validation passed for &1", poContract:ContractId)).
            ELSE
                moLogger:LogWarn("ContractValidator", SUBSTITUTE("Validation failed for &1 (&2 error(s))", poContract:ContractId, oSummary:GetErrors():Size)).
        END.

        RETURN oSummary.
    END METHOD.

END CLASS.
