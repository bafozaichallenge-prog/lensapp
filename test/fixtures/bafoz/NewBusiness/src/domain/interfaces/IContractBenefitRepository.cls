USING domain.entities.ContractBenefit.
USING domain.interfaces.IRepository.
USING OpenEdge.Core.Collections.ArrayList.

INTERFACE domain.interfaces.IContractBenefitRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poContractBenefit AS ContractBenefit).

    METHOD PUBLIC ArrayList GetByContractId (INPUT pcContractId AS CHARACTER).

END INTERFACE.
