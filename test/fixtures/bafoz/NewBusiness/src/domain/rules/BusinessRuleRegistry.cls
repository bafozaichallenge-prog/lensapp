/*------------------------------------------------------------------------
    Class:    BusinessRuleRegistry
    Purpose:  Registers and returns the set of IBusinessRule instances
              that make up new-business validation. New rules can be
              added by registering them here without modifying
              ContractValidator (Open/Closed principle).

    Requirements:  Section 21 - Business Rule Registry
------------------------------------------------------------------------*/

USING domain.interfaces.IBusinessRule.
USING OpenEdge.Core.Collections.ArrayList.

CLASS domain.rules.BusinessRuleRegistry:

    DEFINE PRIVATE VARIABLE moRules AS ArrayList NO-UNDO.

    CONSTRUCTOR PUBLIC BusinessRuleRegistry ( ):
        moRules = NEW ArrayList().
    END CONSTRUCTOR.

    METHOD PUBLIC VOID RegisterRule (INPUT poRule AS IBusinessRule):
        moRules:Add(poRule).
    END METHOD.

    METHOD PUBLIC ArrayList GetRules ( ):
        RETURN moRules.
    END METHOD.

    METHOD PUBLIC INTEGER RuleCount ( ):
        RETURN moRules:Size.
    END METHOD.

END CLASS.
