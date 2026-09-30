/*------------------------------------------------------------------------
    Class:    ValidationResult
    Purpose:  Immutable value object representing the outcome of a single
              business rule evaluation (IBusinessRule:Evaluate()).

    Requirements:  Section 6 (BR-006), Section 18
------------------------------------------------------------------------*/

CLASS domain.validation.ValidationResult:

    DEFINE PUBLIC PROPERTY IsValid   AS LOGICAL   NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY RuleCode  AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Severity  AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Message   AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY FieldName AS CHARACTER NO-UNDO GET. PRIVATE SET.

    /* Severity constants */
    DEFINE PUBLIC STATIC PROPERTY SEVERITY_INFO    AS CHARACTER NO-UNDO INITIAL "INFO"    GET.
    DEFINE PUBLIC STATIC PROPERTY SEVERITY_WARNING AS CHARACTER NO-UNDO INITIAL "WARNING" GET.
    DEFINE PUBLIC STATIC PROPERTY SEVERITY_ERROR   AS CHARACTER NO-UNDO INITIAL "ERROR"   GET.

    CONSTRUCTOR PUBLIC ValidationResult
        ( INPUT plIsValid   AS LOGICAL,
          INPUT pcRuleCode  AS CHARACTER,
          INPUT pcSeverity  AS CHARACTER,
          INPUT pcMessage   AS CHARACTER,
          INPUT pcFieldName AS CHARACTER ):

        IsValid   = plIsValid.
        RuleCode  = pcRuleCode.
        Severity  = pcSeverity.
        Message   = pcMessage.
        FieldName = pcFieldName.

    END CONSTRUCTOR.

    METHOD PUBLIC LOGICAL IsError ( ):
        RETURN NOT IsValid AND Severity = SEVERITY_ERROR.
    END METHOD.

    METHOD PUBLIC LOGICAL IsWarning ( ):
        RETURN NOT IsValid AND Severity = SEVERITY_WARNING.
    END METHOD.

    METHOD PUBLIC Progress.Json.ObjectModel.JsonObject ToJsonObject ( ):
        DEFINE VARIABLE oJson AS Progress.Json.ObjectModel.JsonObject NO-UNDO.
        oJson = NEW Progress.Json.ObjectModel.JsonObject().
        oJson:Add("ruleCode",  RuleCode).
        oJson:Add("isValid",   IsValid).
        oJson:Add("severity",  Severity).
        oJson:Add("field",     FieldName).
        oJson:Add("message",   Message).
        RETURN oJson.
    END METHOD.

END CLASS.
