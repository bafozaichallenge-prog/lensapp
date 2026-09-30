USING domain.entities.Person.
USING domain.interfaces.IRepository.

INTERFACE domain.interfaces.IPersonRepository INHERITS IRepository:

    METHOD PUBLIC VOID Save (INPUT poPerson AS Person).

    METHOD PUBLIC VOID Update (INPUT poPerson AS Person).

    METHOD PUBLIC Person GetById (INPUT pcPersonId AS CHARACTER).

    METHOD PUBLIC CHARACTER GetNextPersonId ( ).

END INTERFACE.
