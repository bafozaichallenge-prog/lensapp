/*------------------------------------------------------------------------
    Class:    PersonRepository
    Purpose:  IPersonRepository implementation.

    Requirements:  Section 23, Section 32 (Person table)
------------------------------------------------------------------------*/

USING domain.interfaces.IPersonRepository.
USING domain.entities.Person.
USING infrastructure.repositories.AbstractRepository.
USING infrastructure.logging.ILogger.
USING exceptions.RepositoryException.

CLASS infrastructure.repositories.PersonRepository INHERITS AbstractRepository IMPLEMENTS IPersonRepository:

    DEFINE PRIVATE VARIABLE miNextSequence AS INTEGER NO-UNDO INITIAL 0.

    CONSTRUCTOR PUBLIC PersonRepository (INPUT poLogger AS ILogger):
        SUPER("Person", poLogger).
    END CONSTRUCTOR.

    METHOD PUBLIC CHARACTER GetNextPersonId ( ):
        miNextSequence = miNextSequence + 1.
        RETURN SUBSTITUTE("PER-&1", STRING(miNextSequence, "999999")).
    END METHOD.

    METHOD PUBLIC VOID Save (INPUT poPerson AS Person):
        IF THIS-OBJECT:Exists(poPerson:PersonId) THEN
            UNDO, THROW NEW RepositoryException(
                SUBSTITUTE("Person &1 already exists.", poPerson:PersonId), "NB-REPO-409").

        moStore:Put(poPerson:PersonId, poPerson).
        THIS-OBJECT:LogOperation("SAVE", poPerson:PersonId).
    END METHOD.

    METHOD PUBLIC VOID Update (INPUT poPerson AS Person):
        THIS-OBJECT:GuardExists(poPerson:PersonId).
        moStore:Put(poPerson:PersonId, poPerson).
        THIS-OBJECT:LogOperation("UPDATE", poPerson:PersonId).
    END METHOD.

    METHOD PUBLIC Person GetById (INPUT pcPersonId AS CHARACTER):
        THIS-OBJECT:GuardExists(pcPersonId).
        RETURN CAST(moStore:Get(pcPersonId), Person).
    END METHOD.

END CLASS.
