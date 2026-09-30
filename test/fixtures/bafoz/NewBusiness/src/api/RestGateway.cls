/*------------------------------------------------------------------------
    Class:    RestGateway
    Purpose:  The one class in the codebase that knows about HTTP. It
              implements PASOE's custom Web Handler interface, matches
              the inbound request against the endpoints in Section 31,
              and dispatches to the existing, transport-agnostic
              controllers under api/controllers/. Nothing below this
              class has ever heard of a URL.

    IMPORTANT - version-sensitive section:
        The `OpenEdge.Web.IWebHandler` contract (a single `Service()`
        method taking `IWebRequest`/`IWebResponse`) has been stable
        across recent OpenEdge releases, and is what's used below.
        The exact accessor for reading a JSON request body and writing
        a JSON response entity HAS drifted between OpenEdge 11.7 and
        12.x. `ReadRequestBody()`, `WriteJsonResponse()`, and the
        header lookup in `ResolveUser()` near the bottom of this file
        are where that lives - confirm the exact OpenEdge.Web.IWebRequest
        / IWebResponse member names for your installed version (see
        the PASOE / OpenEdge.Web class reference in your Progress
        documentation) before relying on this in anything beyond local
        testing.

    Deployment (also version-sensitive - see
    tooling/PASOE-DEPLOYMENT.md): a PASOE instance's web-handler
    mapping config needs an entry pointing a URL prefix such as
    "/new-business/api/*" at "api.RestGateway".

    Requirements:  Section 29 - API Layer, Section 31 - Example API
                   Endpoints
------------------------------------------------------------------------*/

USING OpenEdge.Web.IWebHandler.
USING OpenEdge.Web.IWebRequest.
USING OpenEdge.Web.IWebResponse.
USING Progress.Json.ObjectModel.JsonObject.
USING Progress.Json.ObjectModel.ObjectModelParser.
USING Bootstrap.
USING api.controllers.NewBusinessController.
USING infrastructure.security.IUserContext.
USING infrastructure.security.UserContext.
USING exceptions.ApplicationException.

CLASS api.RestGateway IMPLEMENTS IWebHandler:

    /* Shared report temp-table/dataset - PRIVATE scope inside a class
       (see include/ttContractStatus.i for the NB_TT_SCOPE contract). */
    &SCOPED-DEFINE NB_TT_SCOPE PRIVATE
    {include/ttContractStatus.i}

    /* One Bootstrap per gateway instance. PASOE may pool/recycle
       handler instances across requests depending on how the web app
       is configured (per-request vs. session-scoped); if you need
       state (created contracts) to survive across requests from
       different handler instances, move Bootstrap's construction to
       an application-scoped singleton instead of building it here.
       For local smoke-testing, one instance per handler is simplest.

       NEW Bootstrap(TRUE) wires DbContractRepository: the PASOE agent
       session must have a -db newbusiness connection (startup -pf or
       session manager config). Use NEW Bootstrap() to keep the
       in-memory store for local smoke tests. */
    DEFINE PRIVATE VARIABLE moBootstrap AS Bootstrap NO-UNDO.

    CONSTRUCTOR PUBLIC RestGateway ( ):
        moBootstrap = NEW Bootstrap(TRUE).
        moBootstrap:SeedMockData().
    END CONSTRUCTOR.

    METHOD PUBLIC VOID Service (INPUT pRequest AS IWebRequest, INPUT pResponse AS IWebResponse):
        DEFINE VARIABLE cMethod     AS CHARACTER NO-UNDO.
        DEFINE VARIABLE cPath       AS CHARACTER NO-UNDO.
        DEFINE VARIABLE cContractId AS CHARACTER NO-UNDO.
        DEFINE VARIABLE oBody       AS JsonObject NO-UNDO.
        DEFINE VARIABLE oUser       AS IUserContext NO-UNDO.
        DEFINE VARIABLE oResult     AS JsonObject NO-UNDO.

        /* CATCH blocks must sit at the very end of the block they guard,
           so the whole routing table lives inside this one DO block and
           every branch below simply RETURNs once it has written a
           response - RETURN exits Service() itself, not just this DO. */
        ROUTE-BLOCK:
        DO:
            cMethod = pRequest:Method.
            cPath   = pRequest:URI:Path.
            oUser   = THIS-OBJECT:ResolveUser(pRequest).

            /* ---- GET /api/reports/contract-status?status=IN-FORCE ----- */
            IF cMethod = "GET" AND cPath MATCHES "*api/reports/contract-status" THEN DO:
                oResult = THIS-OBJECT:RunContractStatusReport(pRequest).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            /* ---- POST /api/new-business/contracts --------------------- */
            IF cMethod = "POST" AND cPath MATCHES "*api/new-business/contracts" THEN DO:
                oBody   = THIS-OBJECT:ReadRequestBody(pRequest).
                oResult = moBootstrap:NewBusinessController:CreateContract(oBody, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 201, oResult).
                RETURN.
            END.

            /* ---- everything else is scoped to one contract ------------- */
            cContractId = THIS-OBJECT:ExtractContractId(cPath).

            IF cMethod = "POST" AND cPath MATCHES "*/person" THEN DO:
                oBody   = THIS-OBJECT:ReadRequestBody(pRequest).
                oResult = moBootstrap:NewBusinessController:CapturePerson(cContractId, oBody, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            IF cMethod = "POST" AND cPath MATCHES "*/benefits" THEN DO:
                oBody   = THIS-OBJECT:ReadRequestBody(pRequest).
                oResult = moBootstrap:NewBusinessController:AddBenefit(cContractId, oBody, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            IF cMethod = "POST" AND cPath MATCHES "*/collection" THEN DO:
                oBody   = THIS-OBJECT:ReadRequestBody(pRequest).
                oResult = moBootstrap:NewBusinessController:CaptureCollection(cContractId, oBody, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            IF cMethod = "POST" AND cPath MATCHES "*/validate" THEN DO:
                oResult = moBootstrap:NewBusinessController:ValidateContract(cContractId, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            IF cMethod = "POST" AND cPath MATCHES "*/activate" THEN DO:
                oResult = moBootstrap:NewBusinessController:ActivateContract(cContractId, oUser).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            IF cMethod = "GET" AND cPath MATCHES "*api/contracts/*" THEN DO:
                oResult = moBootstrap:ContractController:GetContract(cContractId).
                THIS-OBJECT:WriteJsonResponse(pResponse, 200, oResult).
                RETURN.
            END.

            THIS-OBJECT:WriteJsonResponse(pResponse, 404,
                THIS-OBJECT:ErrorJson2("NB404", SUBSTITUTE("No route for &1 &2", cMethod, cPath))).

            CATCH appErr AS ApplicationException:
                THIS-OBJECT:WriteJsonResponse(pResponse, 409, THIS-OBJECT:ErrorJson(appErr)).
            END CATCH.

            CATCH anyErr AS Progress.Lang.Error:
                THIS-OBJECT:WriteJsonResponse(pResponse, 500,
                    THIS-OBJECT:ErrorJson2("NB500", "Unexpected server error.")).
            END CATCH.
        END.
    END METHOD.

    /* GET /api/reports/contract-status - delegates row collection to
       the stateless report procedure and serializes the returned
       ProDataSet to JSON. Version-sensitive: the query-string accessor
       on IWebRequest differs between OpenEdge releases - confirm
       against your installed version as noted in the class header. */
    METHOD PRIVATE JsonObject RunContractStatusReport (INPUT pRequest AS IWebRequest):
        DEFINE VARIABLE cStatus AS CHARACTER NO-UNDO.
        DEFINE VARIABLE lcJson  AS LONGCHAR  NO-UNDO.
        DEFINE VARIABLE oParser AS ObjectModelParser NO-UNDO.

        cStatus = "".
        IF pRequest:URI:Query <> ? AND pRequest:URI:Query <> "" THEN DO:
            IF NUM-ENTRIES(pRequest:URI:Query, "&") >= 1 THEN DO:
                cStatus = ENTRY(2, ENTRY(1, pRequest:URI:Query, "&"), "=").
            END.
        END.

        RUN src/api/procs/ContractStatusReport.p
            (INPUT cStatus, OUTPUT DATASET dsContractStatus).

        DATASET dsContractStatus:WRITE-JSON("LONGCHAR", lcJson, TRUE).
        oParser = NEW ObjectModelParser().
        RETURN CAST(oParser:Parse(lcJson), JsonObject).
    END METHOD.

    /* Section 38 - resolves the caller's role from whatever the
       transport layer authenticated (a PASOE OAuth/JWT filter, HTTP
       Basic, a session cookie, ...). Hard-coded here so the gateway is
       runnable without wiring up real authentication first; replace
       with a real claims lookup before this goes anywhere near the
       open internet. */
    METHOD PRIVATE IUserContext ResolveUser (INPUT pRequest AS IWebRequest):
        DEFINE VARIABLE cRoleHeader AS CHARACTER NO-UNDO.
        cRoleHeader = pRequest:GetHeader("X-Demo-Role"):Value.
        IF cRoleHeader = "" OR cRoleHeader = ? THEN
            cRoleHeader = UserContext:ROLE_AGENT.
        RETURN NEW UserContext("demo-user", "demo-user", cRoleHeader).
    END METHOD.

    METHOD PRIVATE CHARACTER ExtractContractId (INPUT pcPath AS CHARACTER):
        DEFINE VARIABLE cAfter AS CHARACTER NO-UNDO.
        cAfter = ENTRY(2, pcPath, "contracts/").
        RETURN ENTRY(1, cAfter, "/").
    END METHOD.

    /* --- Version-sensitive: confirm against your OpenEdge release --- */
    METHOD PRIVATE JsonObject ReadRequestBody (INPUT pRequest AS IWebRequest):
        DEFINE VARIABLE oParser AS ObjectModelParser NO-UNDO.
        IF pRequest:Entity = ? THEN
            RETURN NEW JsonObject().
        oParser = NEW ObjectModelParser().
        RETURN CAST(oParser:Parse(pRequest:Entity), JsonObject).
    END METHOD.

    METHOD PRIVATE VOID WriteJsonResponse (INPUT pResponse AS IWebResponse, INPUT piStatus AS INTEGER, INPUT poBody AS JsonObject):
        pResponse:StatusCode = piStatus.
        pResponse:ContentType = "application/json".
        pResponse:Entity = poBody.
    END METHOD.

    METHOD PRIVATE JsonObject ErrorJson (INPUT poErr AS ApplicationException):
        RETURN THIS-OBJECT:ErrorJson2(poErr:ErrorCode, poErr:GetMessage(1)).
    END METHOD.

    METHOD PRIVATE JsonObject ErrorJson2 (INPUT pcCode AS CHARACTER, INPUT pcMessage AS CHARACTER):
        DEFINE VARIABLE oJson AS JsonObject NO-UNDO.
        oJson = NEW JsonObject().
        oJson:Add("errorCode", pcCode).
        oJson:Add("message", pcMessage).
        RETURN oJson.
    END METHOD.

END CLASS.
