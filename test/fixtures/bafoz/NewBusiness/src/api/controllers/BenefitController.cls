/*------------------------------------------------------------------------
    Class:    BenefitController
    Purpose:  Read-side endpoint for the benefit product catalogue.
              Section 29 - API Layer.
------------------------------------------------------------------------*/

USING domain.interfaces.IBenefitService.
USING domain.entities.Benefit.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.controllers.BenefitController:

    DEFINE PRIVATE VARIABLE moBenefitService AS IBenefitService NO-UNDO.

    CONSTRUCTOR PUBLIC BenefitController (INPUT poBenefitService AS IBenefitService):
        moBenefitService = poBenefitService.
    END CONSTRUCTOR.

    /* GET /api/benefits/{benefitId} */
    METHOD PUBLIC JsonObject GetBenefit (INPUT pcBenefitId AS CHARACTER):
        DEFINE VARIABLE oBenefit AS Benefit     NO-UNDO.
        DEFINE VARIABLE oJson    AS JsonObject  NO-UNDO.

        oBenefit = moBenefitService:GetBenefit(pcBenefitId).

        oJson = NEW JsonObject().
        oJson:Add("benefitId", oBenefit:BenefitId).
        oJson:Add("benefitCode", oBenefit:BenefitCode).
        oJson:Add("benefitName", oBenefit:BenefitName).
        oJson:Add("premium", oBenefit:Premium).
        oJson:Add("status", oBenefit:Status).
        RETURN oJson.
    END METHOD.

END CLASS.
