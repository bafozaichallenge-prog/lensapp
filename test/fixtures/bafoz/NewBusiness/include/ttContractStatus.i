/*------------------------------------------------------------------------
    Include:  ttContractStatus.i
    Purpose:  Shared temp-table + ProDataSet definition for the Contract
              Status report. Consumed by both delivery channels so the
              field list lives in exactly one place:
                  - src/api/procs/ContractStatusReport.p  (PASOE JSON)
                  - src/batch/ExportContractStatusCsv.p   (nightly CSV)

    Scope:    callers may &SCOPED-DEFINE NB_TT_SCOPE before including
              this file to control the class-level scope of the defs:
                  &SCOPED-DEFINE NB_TT_SCOPE PRIVATE   (inside a CLASS)
              In a .p just include it - the macro expands empty.

    NOTE:     any field added here ripples to every consumer - update
              both dependent procedures in the same commit.
------------------------------------------------------------------------*/

DEFINE {&NB_TT_SCOPE} TEMP-TABLE ttContractStatus NO-UNDO
    FIELD ContractId        AS CHARACTER
    FIELD Status            AS CHARACTER
    FIELD CampaignId        AS CHARACTER
    FIELD OwnerPersonId     AS CHARACTER
    FIELD OwnerSurname      AS CHARACTER
    FIELD CollectionMethod  AS CHARACTER
    FIELD TotalPremium      AS DECIMAL
    FIELD BenefitCount      AS INTEGER
    FIELD CreatedDate       AS DATETIME
    FIELD ActivatedDate     AS DATETIME
    INDEX idxContract       IS PRIMARY UNIQUE ContractId
    INDEX idxStatus         Status.

DEFINE {&NB_TT_SCOPE} DATASET dsContractStatus FOR ttContractStatus.
