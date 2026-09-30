/*------------------------------------------------------------------------
    Class:    DbContractRepository
    Purpose:  IContractRepository implementation backed by the real
              Contract / ContractBenefit / CollectionInstruction tables
              in database/schema/newbusiness.df. Selected by Bootstrap
              when plUseDbPersistence = TRUE; no calling code changes
              because every caller depends on IContractRepository only
              (README - Persistence strategy, Section 39).

    Transaction strategy (Section 34 - Transaction Management):
        - Reads (GetById/Exists/HasActiveContractForOwner) use NO-LOCK -
          report-style reads must never hold record locks on a PASOE
          agent.
        - Save/Update/Delete run inside an explicit DO TRANSACTION so
          the contract row and its children commit or roll back as one
          atomic unit - a partial activation can never be persisted.
        - Mutations fetch the record EXCLUSIVE-LOCK NO-WAIT inside the
          transaction and RELEASE it at block end, so lock duration
          equals transaction duration.
        - A record already locked by another session raises
          RepositoryException "NB-REPO-423" instead of blocking the
          agent (Edge Case: "Lock conflict during activation").
        - Every guarded block catches Progress.Lang.AppError first
          (re-thrown untouched so NB-* error codes survive), then wraps
          anything else in "NB-REPO-500".

    Note on naming: table buffers (Contract, ContractBenefit) and the
    domain types share names; ABL resolves "FOR EACH ContractBenefit"
    to the table and "AS ContractBenefit" to the type by context.

    Requirements:  Section 23, Section 24, Section 34
------------------------------------------------------------------------*/

USING domain.interfaces.IContractRepository.
USING domain.entities.Contract.
USING domain.entities.ContractBenefit.
USING domain.entities.CollectionInstruction.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.
USING OpenEdge.Core.Collections.ArrayList.

CLASS infrastructure.repositories.DbContractRepository IMPLEMENTS IContractRepository:

    DEFINE PRIVATE VARIABLE moLogger AS ILogger NO-UNDO.

    CONSTRUCTOR PUBLIC DbContractRepository (INPUT poLogger AS ILogger):
        moLogger = poLogger.
    END CONSTRUCTOR.

    /* Sequence-backed ID generation (database/delta/003). */
    METHOD PUBLIC CHARACTER GetNextContractId ( ):
        RETURN SUBSTITUTE("CON-&1", STRING(NEXT-VALUE(SeqContract), "999999")).
    END METHOD.

    METHOD PUBLIC VOID Save (INPUT poContract AS Contract):
        DO TRANSACTION
           ON ERROR UNDO, THROW:

            FIND Contract WHERE Contract.ContractId = poContract:ContractId
                NO-LOCK NO-ERROR.
            IF AVAILABLE Contract THEN
                UNDO, THROW NEW RepositoryException(
                    SUBSTITUTE("Contract &1 already exists.", poContract:ContractId),
                    "NB-REPO-409").

            CREATE Contract.
            ASSIGN
                Contract.ContractId    = poContract:ContractId
                Contract.Status        = poContract:Status
                Contract.CampaignId    = poContract:CampaignId
                Contract.OwnerPersonId = poContract:OwnerPersonId
                Contract.TotalPremium  = poContract:TotalPremium
                Contract.CreatedDate   = poContract:CreatedDate
                Contract.ModifiedDate  = NOW.
            RELEASE Contract.

            THIS-OBJECT:LogOperation("SAVE", poContract:ContractId).

            CATCH e AS Progress.Lang.AppError:
                UNDO, THROW e.
            END CATCH.
            CATCH e AS Progress.Lang.Error:
                UNDO, THROW THIS-OBJECT:WrapError("SAVE", poContract:ContractId, e).
            END CATCH.
        END.
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poContract AS Contract):
        DO TRANSACTION
           ON ERROR UNDO, THROW:

            FIND Contract WHERE Contract.ContractId = poContract:ContractId
                EXCLUSIVE-LOCK NO-WAIT NO-ERROR.
            IF LOCKED Contract THEN
                UNDO, THROW NEW RepositoryException(
                    SUBSTITUTE("Contract &1 is locked by another session - retry the request.", poContract:ContractId),
                    "NB-REPO-423").
            IF NOT AVAILABLE Contract THEN
                UNDO, THROW NEW RepositoryException(
                    SUBSTITUTE("Contract &1 was not found.", poContract:ContractId),
                    "NB-REPO-404").

            ASSIGN
                Contract.Status        = poContract:Status
                Contract.CampaignId    = poContract:CampaignId
                Contract.OwnerPersonId = poContract:OwnerPersonId
                Contract.TotalPremium  = poContract:TotalPremium
                Contract.ActivatedDate = poContract:ActivatedDate
                Contract.ModifiedDate  = NOW.

            /* Child rows commit inside the SAME transaction as the
               parent - activation + children are one atomic unit. */
            THIS-OBJECT:WriteChildren(poContract).

            RELEASE Contract.
            THIS-OBJECT:LogOperation("UPDATE", poContract:ContractId).

            CATCH e AS Progress.Lang.AppError:
                UNDO, THROW e.
            END CATCH.
            CATCH e AS Progress.Lang.Error:
                UNDO, THROW THIS-OBJECT:WrapError("UPDATE", poContract:ContractId, e).
            END CATCH.
        END.
    END METHOD.

    /* NO-LOCK aggregate rehydration: reads the row set and rebuilds the
       entity through its RestorePersistedState() seams - mutators like
       AssignCampaign()/AddBenefit() are deliberately not used because
       they would (correctly) reject changes to an IN-FORCE contract,
       and rehydration is not a business mutation. */
    METHOD PUBLIC Contract GetById (INPUT pcContractId AS CHARACTER):
        DEFINE VARIABLE oContract    AS Contract              NO-UNDO.
        DEFINE VARIABLE oInstruction AS CollectionInstruction NO-UNDO.
        DEFINE VARIABLE oCB          AS ContractBenefit       NO-UNDO.

        FIND Contract WHERE Contract.ContractId = pcContractId
            NO-LOCK NO-ERROR.
        IF NOT AVAILABLE Contract THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("Contract &1 was not found.", pcContractId),
                "NB-REPO-404").

        oInstruction = ?.
        FIND CollectionInstruction WHERE CollectionInstruction.ContractId = pcContractId
            NO-LOCK NO-ERROR.
        IF AVAILABLE CollectionInstruction THEN DO:
            oInstruction = NEW CollectionInstruction().
            oInstruction:Create(
                CollectionInstruction.ContractId,
                CollectionInstruction.CollectionMethod,
                CollectionInstruction.CollectionDay,
                CollectionInstruction.AccountNumber,
                CollectionInstruction.BankCode,
                CollectionInstruction.AccountHolderName,
                "db-restore").
        END.

        oContract = NEW Contract().
        oContract:Create(Contract.ContractId, "db-restore").
        oContract:RestorePersistedState(
            Contract.Status, Contract.CampaignId, Contract.OwnerPersonId,
            Contract.TotalPremium, Contract.ActivatedDate, Contract.ModifiedDate,
            oInstruction).

        FOR EACH ContractBenefit WHERE ContractBenefit.ContractId = pcContractId
            NO-LOCK:
            oCB = NEW ContractBenefit().
            oCB:RestorePersistedState(
                ContractBenefit.ContractId, ContractBenefit.BenefitId,
                ContractBenefit.BenefitCode, ContractBenefit.Premium,
                ContractBenefit.EffectiveDate).
            oContract:RestoreBenefit(oCB).
        END.

        RETURN oContract.
    END METHOD.

    /* DuplicateContractRule support - NO-LOCK read, never takes a lock
       just to answer "does an IN-FORCE contract exist for this owner". */
    METHOD PUBLIC LOGICAL HasActiveContractForOwner (INPUT pcOwnerPersonId AS CHARACTER):
        FIND FIRST Contract NO-LOCK
           WHERE Contract.OwnerPersonId = pcOwnerPersonId
             AND Contract.Status        = Contract:STATUS_IN_FORCE
           NO-ERROR.
        RETURN AVAILABLE Contract.
    END METHOD.

    METHOD PUBLIC LOGICAL Exists (INPUT pcId AS CHARACTER):
        IF pcId = "" OR pcId = ? THEN
            RETURN FALSE.
        FIND Contract WHERE Contract.ContractId = pcId NO-LOCK NO-ERROR.
        RETURN AVAILABLE Contract.
    END METHOD.

    /* Deletes the contract row and its children inside one transaction. */
    METHOD PUBLIC LOGICAL Delete (INPUT pcId AS CHARACTER):
        DEFINE VARIABLE lDeleted AS LOGICAL NO-UNDO INITIAL FALSE.

        DO TRANSACTION
           ON ERROR UNDO, THROW:

            FIND Contract WHERE Contract.ContractId = pcId
                EXCLUSIVE-LOCK NO-WAIT NO-ERROR.
            IF LOCKED Contract THEN
                UNDO, THROW NEW RepositoryException(
                    SUBSTITUTE("Contract &1 is locked by another session - retry the request.", pcId),
                    "NB-REPO-423").
            IF NOT AVAILABLE Contract THEN
                RETURN FALSE.

            FOR EACH ContractBenefit WHERE ContractBenefit.ContractId = pcId
                EXCLUSIVE-LOCK:
                DELETE ContractBenefit.
            END.

            FIND CollectionInstruction WHERE CollectionInstruction.ContractId = pcId
                EXCLUSIVE-LOCK NO-WAIT NO-ERROR.
            IF AVAILABLE CollectionInstruction THEN
                DELETE CollectionInstruction.

            DELETE Contract.
            RELEASE Contract.
            lDeleted = TRUE.
            THIS-OBJECT:LogOperation("DELETE", pcId).

            CATCH e AS Progress.Lang.AppError:
                UNDO, THROW e.
            END CATCH.
            CATCH e AS Progress.Lang.Error:
                UNDO, THROW THIS-OBJECT:WrapError("DELETE", pcId, e).
            END CATCH.
        END.

        RETURN lDeleted.
    END METHOD.

    /* Rewrites the join-table children + collection instruction inside
       the caller's transaction. Join rows are replaced wholesale -
       simplest correct strategy for a (ContractId, BenefitId) key. */
    METHOD PRIVATE VOID WriteChildren (INPUT poContract AS Contract):
        DEFINE VARIABLE oCB AS ContractBenefit NO-UNDO.
        DEFINE VARIABLE i   AS INTEGER         NO-UNDO.

        FOR EACH ContractBenefit WHERE ContractBenefit.ContractId = poContract:ContractId
            EXCLUSIVE-LOCK:
            DELETE ContractBenefit.
        END.

        DO i = 1 TO poContract:GetBenefitCount():
            oCB = CAST(poContract:GetBenefits():Get(i), ContractBenefit).
            CREATE ContractBenefit.
            ASSIGN
                ContractBenefit.ContractId    = oCB:ContractId
                ContractBenefit.BenefitId     = oCB:BenefitId
                ContractBenefit.BenefitCode   = oCB:BenefitCode
                ContractBenefit.Premium       = oCB:Premium
                ContractBenefit.EffectiveDate = oCB:EffectiveDate.
            RELEASE ContractBenefit.
        END.

        IF VALID-OBJECT(poContract:CollectionInstructionRef) THEN DO:
            FIND CollectionInstruction WHERE CollectionInstruction.ContractId = poContract:ContractId
                EXCLUSIVE-LOCK NO-WAIT NO-ERROR.
            IF LOCKED CollectionInstruction THEN
                UNDO, THROW NEW RepositoryException(
                    SUBSTITUTE("Collection instruction for &1 is locked by another session.", poContract:ContractId),
                    "NB-REPO-423").
            IF NOT AVAILABLE CollectionInstruction THEN DO:
                CREATE CollectionInstruction.
                CollectionInstruction.ContractId = poContract:ContractId.
            END.
            ASSIGN
                CollectionInstruction.CollectionMethod  = poContract:CollectionInstructionRef:CollectionMethod
                CollectionInstruction.CollectionDay     = poContract:CollectionInstructionRef:CollectionDay
                CollectionInstruction.AccountNumber     = poContract:CollectionInstructionRef:AccountNumber
                CollectionInstruction.BankCode          = poContract:CollectionInstructionRef:BankCode
                CollectionInstruction.AccountHolderName = poContract:CollectionInstructionRef:AccountHolderName.
            RELEASE CollectionInstruction.
        END.
    END METHOD.

    METHOD PRIVATE VOID LogOperation (INPUT pcOperation AS CHARACTER, INPUT pcId AS CHARACTER):
        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("DbContractRepository", SUBSTITUTE("&1 &2", pcOperation, pcId)).
    END METHOD.

    METHOD PRIVATE RepositoryException WrapError (INPUT pcOperation AS CHARACTER, INPUT pcId AS CHARACTER, INPUT poError AS Progress.Lang.Error):
        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogError("DbContractRepository",
                SUBSTITUTE("&1 failed for &2: &3", pcOperation, pcId, poError:GetMessage(1))).
        RETURN NEW RepositoryException(
            SUBSTITUTE("Contract operation &1 failed for &2.", pcOperation, pcId),
            "NB-REPO-500").
    END METHOD.

END CLASS.
