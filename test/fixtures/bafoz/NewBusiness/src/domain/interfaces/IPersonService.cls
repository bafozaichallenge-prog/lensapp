USING domain.entities.Person.

INTERFACE domain.interfaces.IPersonService:

    METHOD PUBLIC Person CapturePerson
        ( INPUT pcFirstName    AS CHARACTER,
          INPUT pcSurname      AS CHARACTER,
          INPUT pdDateOfBirth  AS DATE,
          INPUT pcIDNumber     AS CHARACTER,
          INPUT pcEmail        AS CHARACTER,
          INPUT pcMobileNumber AS CHARACTER,
          INPUT pcAddress      AS CHARACTER,
          INPUT pcUserId       AS CHARACTER ).

    METHOD PUBLIC Person GetPerson (INPUT pcPersonId AS CHARACTER).

END INTERFACE.
