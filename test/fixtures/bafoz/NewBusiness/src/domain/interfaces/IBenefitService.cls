USING domain.entities.Benefit.
USING domain.entities.ContractBenefit.

INTERFACE domain.interfaces.IBenefitService:

    METHOD PUBLIC Benefit GetBenefit (INPUT pcBenefitId AS CHARACTER).

    METHOD PUBLIC ContractBenefit AddBenefitToContract (INPUT pcContractId AS CHARACTER, INPUT pcBenefitId AS CHARACTER, INPUT pcUserId AS CHARACTER).

END INTERFACE.
