/*------------------------------------------------------------------------
    Program:  ExportContractStatusCsv.p
    Purpose:  Nightly batch extract for finance - reuses the shared
              ttContractStatus shape (include/ttContractStatus.i) filled
              by src/api/procs/ContractStatusReport.p and writes it as
              CSV. Same report definition, second consumer.

    Usage:
        RUN src/batch/ExportContractStatusCsv.p
            (INPUT "IN-FORCE", INPUT "out\contract-status.csv").
------------------------------------------------------------------------*/

{include/ttContractStatus.i}

DEFINE INPUT PARAMETER pcStatus AS CHARACTER NO-UNDO.
DEFINE INPUT PARAMETER pcFile   AS CHARACTER NO-UNDO.

/* Fill via the report proc - the dataset parameter requires the same
   definition, which is exactly what the shared include guarantees. */
RUN src/api/procs/ContractStatusReport.p
    (INPUT pcStatus, OUTPUT DATASET dsContractStatus).

OUTPUT TO VALUE(pcFile).

PUT UNFORMATTED "ContractId,Status,CampaignId,OwnerPersonId,OwnerSurname,CollectionMethod,TotalPremium,BenefitCount,CreatedDate,ActivatedDate" SKIP.

FOR EACH ttContractStatus:
    PUT UNFORMATTED
        ttContractStatus.ContractId       ","
        ttContractStatus.Status           ","
        ttContractStatus.CampaignId       ","
        ttContractStatus.OwnerPersonId    ","
        ttContractStatus.OwnerSurname     ","
        ttContractStatus.CollectionMethod ","
        ttContractStatus.TotalPremium     ","
        ttContractStatus.BenefitCount     ","
        ttContractStatus.CreatedDate      ","
        ttContractStatus.ActivatedDate    SKIP.
END.

OUTPUT CLOSE.

RETURN.
