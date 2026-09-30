/*------------------------------------------------------------------------
    Program:  ContractStatusReport.p
    Purpose:  Stateless PASOE-callable report procedure. Fills
              ttContractStatus (include/ttContractStatus.i) for the
              requested Status filter and returns the dataset to the
              caller for serialization.

    Stateless/PASOE rules honoured:
        - NO-UNDO temp-table (declared in the include)
        - NO-LOCK reads only - reporting must never hold record locks
        - EMPTY TEMP-TABLE first, so a pooled agent session can never
          leak rows from a previous call
        - No persistent buffers, globals, or shared objects - nothing
          survives the call boundary

    Usage:
        RUN src/api/procs/ContractStatusReport.p
            (INPUT "IN-FORCE", OUTPUT DATASET dsContractStatus).
------------------------------------------------------------------------*/

{include/ttContractStatus.i}

DEFINE INPUT  PARAMETER pcStatus AS CHARACTER NO-UNDO.
DEFINE OUTPUT PARAMETER DATASET FOR dsContractStatus.

DEFINE VARIABLE iBenefits AS INTEGER NO-UNDO.

REPORT-BLOCK:
DO ON ERROR UNDO, THROW:

    EMPTY TEMP-TABLE ttContractStatus.

    FOR EACH Contract NO-LOCK
       WHERE (pcStatus = "" OR pcStatus = ? OR Contract.Status = pcStatus):

        iBenefits = 0.
        FOR EACH ContractBenefit NO-LOCK
           WHERE ContractBenefit.ContractId = Contract.ContractId:
            iBenefits = iBenefits + 1.
        END.

        CREATE ttContractStatus.
        ASSIGN
            ttContractStatus.ContractId    = Contract.ContractId
            ttContractStatus.Status        = Contract.Status
            ttContractStatus.CampaignId    = Contract.CampaignId
            ttContractStatus.OwnerPersonId = Contract.OwnerPersonId
            ttContractStatus.TotalPremium  = Contract.TotalPremium
            ttContractStatus.BenefitCount  = iBenefits
            ttContractStatus.CreatedDate   = Contract.CreatedDate
            ttContractStatus.ActivatedDate = Contract.ActivatedDate.

        /* Owner surname via NO-LOCK join - blank for contracts still
           awaiting person capture. */
        FIND Person NO-LOCK WHERE Person.PersonId = Contract.OwnerPersonId NO-ERROR.
        IF AVAILABLE Person THEN
            ttContractStatus.OwnerSurname = Person.Surname.

        /* Collection method via NO-LOCK join - blank until captured. */
        FIND CollectionInstruction NO-LOCK
           WHERE CollectionInstruction.ContractId = Contract.ContractId NO-ERROR.
        IF AVAILABLE CollectionInstruction THEN
            ttContractStatus.CollectionMethod = CollectionInstruction.CollectionMethod.
    END.

    CATCH e AS Progress.Lang.AppError:
        UNDO, THROW e.
    END CATCH.
    CATCH e AS Progress.Lang.Error:
        UNDO, THROW NEW Progress.Lang.AppError(
            SUBSTITUTE("Contract status report failed: &1", e:GetMessage(1)), 0).
    END CATCH.
END.

RETURN.
