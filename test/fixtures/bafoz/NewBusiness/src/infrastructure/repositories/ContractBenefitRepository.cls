/*------------------------------------------------------------------------
    Class:    ContractBenefitRepository
    Purpose:  IContractBenefitRepository implementation. Stores the
              ContractBenefit associations independently of the Contract
              aggregate's in-memory list, mirroring the ContractBenefit
              table (Section 32) so the link table can be queried on its
              own (e.g. by reporting code) without loading a full
              Contract aggregate.

    Requirements:  Section 23
------------------------------------------------------------------------*/

USING domain.interfaces.IContractBenefitRepository.
USING domain.entities.ContractBenefit.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING OpenEdge.Core.Collections.ArrayList.

CLASS infrastructure.repositories.ContractBenefitRepository INHERITS AbstractRepository IMPLEMENTS IContractBenefitRepository:

    CONSTRUCTOR PUBLIC ContractBenefitRepository (INPUT poLogger AS ILogger):
        SUPER("ContractBenefit", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC VOID Save (INPUT poContractBenefit AS ContractBenefit):
        DEFINE VARIABLE oList AS ArrayList NO-UNDO.

        IF moStore:ContainsKey(poContractBenefit:ContractId) THEN
            oList = CAST(moStore:Get(poContractBenefit:ContractId), ArrayList).
        ELSE DO:
            oList = NEW ArrayList().
            moStore:Put(poContractBenefit:ContractId, oList).
        END.

        oList:Add(poContractBenefit).
        THIS-OBJECT:LogOperation("SAVE", poContractBenefit:ContractId).
    END METHOD.

    METHOD PUBLIC ArrayList GetByContractId (INPUT pcContractId AS CHARACTER):
        IF NOT moStore:ContainsKey(pcContractId) THEN
            RETURN NEW ArrayList().
        RETURN CAST(moStore:Get(pcContractId), ArrayList).
    END METHOD.

END CLASS.
