USING domain.entities.Benefit.
USING domain.interfaces.IRepository.

INTERFACE domain.interfaces.IBenefitRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poBenefit AS Benefit).

    METHOD PUBLIC VOID Update (INPUT poBenefit AS Benefit).

    METHOD PUBLIC Benefit GetById (INPUT pcBenefitId AS CHARACTER).

    METHOD PUBLIC Benefit GetByCode (INPUT pcBenefitCode AS CHARACTER).

END INTERFACE.
