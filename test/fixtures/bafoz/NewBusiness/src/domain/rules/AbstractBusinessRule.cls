/*------------------------------------------------------------------------
    Class:    AbstractBusinessRule
    Purpose:  Shared behaviour for every concrete IBusinessRule
              implementation - carries the rule's identifying metadata
              (rule code, requirement id, description, severity) and
              factors out ValidationResult construction so concrete
              rules only implement their specific Evaluate() logic.

    Requirements:  Section 17 - Abstract Business Rule Base Class,
                   Section 46 - Requirements Traceability
------------------------------------------------------------------------*/

USING domain.interfaces.IBusinessRule.
USING domain.entities.Contract.
USING domain.validation.ValidationResult.

CLASS domain.rules.AbstractBusinessRule ABSTRACT IMPLEMENTS IBusinessRule:

    DEFINE PROTECTED PROPERTY RuleCode      AS CHARACTER NO-UNDO GET. PROTECTED SET.
    DEFINE PROTECTED PROPERTY Description   AS CHARACTER NO-UNDO GET. PROTECTED SET.
    DEFINE PROTECTED PROPERTY RequirementId AS CHARACTER NO-UNDO GET. PROTECTED SET.
    DEFINE PROTECTED PROPERTY Severity      AS CHARACTER NO-UNDO GET. PROTECTED SET.

    CONSTRUCTOR PROTECTED AbstractBusinessRule
        ( INPUT pcRuleCode      AS CHARACTER,
          INPUT pcDescription   AS CHARACTER,
          INPUT pcRequirementId AS CHARACTER,
          INPUT pcSeverity      AS CHARACTER ):

        RuleCode      = pcRuleCode.
        Description   = pcDescription.
        RequirementId = pcRequirementId.
        Severity      = pcSeverity.
    END CONSTRUCTOR.

    METHOD PUBLIC CHARACTER GetRuleCode ( ):
        RETURN RuleCode.
    END METHOD.

    METHOD PUBLIC CHARACTER GetDescription ( ):
        RETURN Description.
    END METHOD.

    METHOD PUBLIC CHARACTER GetRequirementId ( ):
        RETURN RequirementId.
    END METHOD.

    /* Concrete rules implement only their specific evaluation logic. */
    METHOD PUBLIC ABSTRACT ValidationResult Evaluate (INPUT poContract AS Contract).

    METHOD PROTECTED ValidationResult CreateFailureResult (INPUT pcMessage AS CHARACTER, INPUT pcFieldName AS CHARACTER):
        RETURN NEW ValidationResult(FALSE, RuleCode, Severity, pcMessage, pcFieldName).
    END METHOD.

    METHOD PROTECTED ValidationResult CreateSuccessResult ( ):
        RETURN NEW ValidationResult(TRUE, RuleCode, ValidationResult:SEVERITY_INFO, "OK", "").
    END METHOD.

END CLASS.
