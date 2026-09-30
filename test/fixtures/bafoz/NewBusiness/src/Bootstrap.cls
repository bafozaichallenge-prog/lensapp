/*------------------------------------------------------------------------
    Class:    Bootstrap
    Purpose:  Composition root. This is the ONE place in the codebase
              that is allowed to know about concrete classes - it wires
              concrete repositories/services/rules together behind their
              interfaces and hands out fully-constructed, ready-to-use
              application services. Every other class receives its
              dependencies through its constructor (Section 39 -
              Dependency Injection) and never instantiates a concrete
              dependency itself.

              A PASOE web application calls NEW Bootstrap(TRUE) so the
              Contract aggregate is persisted through
              DbContractRepository against the connected newbusiness DB;
              local runs and the ABLUnit suite keep the in-memory
              default via NEW Bootstrap().

    Requirements:  Section 39, Section 55 (Phase 6-8 wiring)
------------------------------------------------------------------------*/

USING domain.rules.BusinessRuleRegistry.
USING domain.rules.CampaignRequiredRule.
USING domain.rules.ContractOwnerRequiredRule.
USING domain.rules.PersonMandatoryDetailsRule.
USING domain.rules.BenefitRequiredRule.
USING domain.rules.BenefitActiveRule.
USING domain.rules.CollectionMethodRequiredRule.
USING domain.rules.CollectionDateRequiredRule.
USING domain.rules.PremiumPositiveRule.
USING domain.rules.ContractStatusRule.
USING domain.rules.DuplicateContractRule.
USING domain.validation.ContractValidator.
USING domain.interfaces.IContractValidator.
USING domain.interfaces.IContractRepository.
USING infrastructure.repositories.ContractRepository.
USING infrastructure.repositories.DbContractRepository.
USING infrastructure.repositories.PersonRepository.
USING infrastructure.repositories.CampaignRepository.
USING infrastructure.repositories.BenefitRepository.
USING infrastructure.repositories.CollectionRepository.
USING infrastructure.logging.ILogger.
USING infrastructure.logging.Logger.
USING infrastructure.audit.IAuditService.
USING infrastructure.audit.AuditService.
USING application.services.ContractService.
USING application.services.PersonService.
USING application.services.BenefitService.
USING application.services.CampaignService.
USING application.services.CollectionService.
USING application.services.NewBusinessService.
USING api.controllers.NewBusinessController.
USING api.controllers.ContractController.
USING api.controllers.PersonController.
USING api.controllers.BenefitController.
USING api.controllers.CampaignController.

CLASS Bootstrap:

    /* ContractRepo is typed to the interface so the concrete
       implementation can be swapped between the in-memory store and
       DbContractRepository without touching callers. */
    DEFINE PUBLIC PROPERTY ContractRepo   AS IContractRepository NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY PersonRepo     AS PersonRepository    NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CampaignRepo   AS CampaignRepository  NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitRepo    AS BenefitRepository   NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CollectionRepo AS CollectionRepository NO-UNDO GET. PRIVATE SET.

    DEFINE PUBLIC PROPERTY Logger       AS ILogger       NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY AuditService AS IAuditService NO-UNDO GET. PRIVATE SET.

    DEFINE PUBLIC PROPERTY NewBusinessService     AS NewBusinessService     NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY NewBusinessController  AS NewBusinessController  NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY ContractController      AS ContractController     NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY PersonController         AS PersonController       NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY BenefitController         AS BenefitController      NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY CampaignController         AS CampaignController     NO-UNDO GET. PRIVATE SET.

    /* Default: in-memory persistence (local runs, ABLUnit). */
    CONSTRUCTOR PUBLIC Bootstrap ( ):
        THIS-OBJECT(FALSE).
    END CONSTRUCTOR.

    /* plUseDbPersistence = TRUE wires DbContractRepository - requires a
       connected newbusiness DB in the session (PASOE: -db parameter or
       .pf on the agent). */
    CONSTRUCTOR PUBLIC Bootstrap (INPUT plUseDbPersistence AS LOGICAL):

        DEFINE VARIABLE oRegistry        AS BusinessRuleRegistry NO-UNDO.
        DEFINE VARIABLE oValidator       AS IContractValidator   NO-UNDO.
        DEFINE VARIABLE oContractRepo    AS IContractRepository  NO-UNDO.
        DEFINE VARIABLE oContractService AS ContractService      NO-UNDO.
        DEFINE VARIABLE oPersonService   AS PersonService        NO-UNDO.
        DEFINE VARIABLE oBenefitService  AS BenefitService       NO-UNDO.
        DEFINE VARIABLE oCampaignService AS CampaignService      NO-UNDO.
        DEFINE VARIABLE oCollectionSvc   AS CollectionService    NO-UNDO.

        /* ---- Cross-cutting infrastructure ------------------------- */
        Logger       = NEW Logger().
        AuditService = NEW AuditService(Logger).

        /* ---- Repositories (Section 23/24) --------------------------
           Contract is the first aggregate swapped to real persistence;
           remaining repositories stay in-memory until their Db* twins
           land (README - Persistence strategy). */
        IF plUseDbPersistence THEN
            oContractRepo = NEW DbContractRepository(Logger).
        ELSE
            oContractRepo = NEW ContractRepository(Logger).
        ContractRepo   = oContractRepo.
        PersonRepo     = NEW PersonRepository(Logger).
        CampaignRepo   = NEW CampaignRepository(Logger).
        BenefitRepo    = NEW BenefitRepository(Logger).
        CollectionRepo = NEW CollectionRepository(Logger).

        /* ---- Business rules + validator (Section 20/21) ------------ */
        oRegistry = NEW BusinessRuleRegistry().
        oRegistry:RegisterRule(NEW CampaignRequiredRule(CampaignRepo)).
        oRegistry:RegisterRule(NEW ContractOwnerRequiredRule()).
        oRegistry:RegisterRule(NEW PersonMandatoryDetailsRule(PersonRepo)).
        oRegistry:RegisterRule(NEW BenefitRequiredRule()).
        oRegistry:RegisterRule(NEW BenefitActiveRule(BenefitRepo)).
        oRegistry:RegisterRule(NEW CollectionMethodRequiredRule()).
        oRegistry:RegisterRule(NEW CollectionDateRequiredRule()).
        oRegistry:RegisterRule(NEW PremiumPositiveRule()).
        oRegistry:RegisterRule(NEW ContractStatusRule()).
        oRegistry:RegisterRule(NEW DuplicateContractRule(oContractRepo)).

        oValidator = NEW ContractValidator(oRegistry, Logger).

        /* ---- Application services (Section 25) ---------------------- */
        oContractService = NEW ContractService(oContractRepo, Logger).
        oPersonService    = NEW PersonService(PersonRepo, Logger).
        oBenefitService    = NEW BenefitService(BenefitRepo, oContractRepo, Logger).
        oCampaignService    = NEW CampaignService(CampaignRepo).
        oCollectionSvc        = NEW CollectionService(CollectionRepo, oContractRepo, Logger).

        NewBusinessService = NEW NewBusinessService(
            oContractService, oPersonService, oBenefitService, oCollectionSvc,
            oValidator, AuditService, Logger).

        /* ---- API layer (Section 29) ---------------------------------- */
        NewBusinessController = NEW NewBusinessController(NewBusinessService).
        ContractController      = NEW ContractController(oContractService).
        PersonController         = NEW PersonController(oPersonService).
        BenefitController         = NEW BenefitController(oBenefitService).
        CampaignController         = NEW CampaignController(oCampaignService).

    END CONSTRUCTOR.

    /* Loads the standard Section 52 mock data (campaigns + benefits)
       into this Bootstrap instance's repositories. */
    METHOD PUBLIC VOID SeedMockData ( ):
        RUN database/seed/SeedData.p (INPUT CampaignRepo, INPUT BenefitRepo).
    END METHOD.

END CLASS.
