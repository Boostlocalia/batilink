import { OPERATOR as O, type LegalTexts } from "./types";

const P = `${O.name} (ondernemingsnummer ${O.enterprise}, btw ${O.vat}), ${O.addressNl}`;

export const legalNl: LegalTexts = {
  updated: "Van kracht sinds 20 oktober 2026",
  nav: {
    mentions: "Wettelijke vermeldingen",
    conditions: "Algemene voorwaarden",
    confidentialite: "Privacy",
    cookies: "Cookies",
    suppression: "Account verwijderen",
  },
  docs: {
    mentions: {
      title: "Wettelijke vermeldingen",
      sections: [
        {
          title: "Uitgever",
          body: [
            `BatiNode (${O.site}) wordt uitgegeven en uitgebaat door ${P}.`,
            `Contact: ${O.email}.`,
          ],
        },
        {
          title: "Hosting",
          body: [
            "De webapplicatie wordt aangeboden via GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, Verenigde Staten).",
            "De gegevens van accounts, aanvragen, offertes en bestanden worden gehost door Supabase, Inc. in een datacenter in Frankfurt (Duitsland, Europese Unie).",
          ],
        },
        {
          title: "Intellectuele eigendom",
          body: [
            `Het merk BatiNode, het logo, Nodi, de teksten, de illustraties en de code van de applicatie behoren toe aan ${O.name}. Elke overname zonder schriftelijke toestemming is verboden.`,
            "Namen, logo’s en inhoud van ingeschreven bedrijven blijven eigendom van die bedrijven.",
          ],
        },
        {
          title: "Inhoud melden",
          body: [
            `Om onwettige inhoud of een fout te melden, schrijf naar ${O.email}. Wij antwoorden zo snel mogelijk.`,
          ],
        },
      ],
    },

    conditions: {
      title: "Algemene gebruiks- en verkoopvoorwaarden",
      sections: [
        {
          title: "1. Voorwerp",
          body: [
            `Deze voorwaarden regelen het gebruik van BatiNode, een platform uitgebaat door ${P}, en de abonnementen die erop verkocht worden.`,
            "Door een account aan te maken, op een prijsaanvraag te antwoorden of de applicatie te gebruiken, aanvaardt u deze voorwaarden namens het bedrijf dat u vertegenwoordigt.",
          ],
        },
        {
          title: "2. Een platform voor professionals",
          body: [
            "BatiNode richt zich uitsluitend tot bedrijven: bouwaannemers, leveranciers van materialen en architecten. Elk bedrijf moet een actief Belgisch ondernemingsnummer hebben.",
            "Wij controleren het btw-nummer (VIES) en de inschrijving in de Kruispuntbank van Ondernemingen, bij de inschrijving en daarna regelmatig. Een account van een niet-actief bedrijf of met onjuiste gegevens kan worden opgeschort.",
            "U bent verantwoordelijk voor de gegevens die u opgeeft, voor de geheimhouding van uw wachtwoord en voor wat met uw account gebeurt. Meld elk ongeoorloofd gebruik onmiddellijk.",
          ],
        },
        {
          title: "3. De diensten",
          body: [
            "Met BatiNode kunt u onder meer prijsaanvragen naar leveranciers sturen en hun offertes vergelijken, bestelbonnen opmaken, met andere aannemers in het netwerk communiceren, bestanden beheren en hulp krijgen van Nodi, de assistent van BatiNode.",
            "Welke functies beschikbaar zijn, hangt af van het gekozen abonnement, zoals vermeld op de pagina Abonnement in de applicatie.",
          ],
        },
        {
          title: "4. De rol van BatiNode",
          body: [
            "BatiNode brengt bedrijven met elkaar in contact. Wij zijn geen partij bij de overeenkomsten tussen hen: de verkoop van materialen wordt rechtstreeks gesloten tussen de aannemer en de leverancier, onder de voorwaarden van hun offerte en bestelbon.",
            "Wij waarborgen geen prijzen, kwaliteit, termijnen of solvabiliteit van gebruikers. De controle van bedrijven beperkt de risico’s, maar sluit ze niet uit.",
            "Kiest de aannemer zelf geen leveranciers, dan selecteert BatiNode leveranciers uit de regio op basis van hun activiteit en nabijheid, zonder tegenprestatie van hun kant.",
          ],
        },
        {
          title: "5. Abonnementen voor aannemers",
          body: [
            "Een nieuwe aannemer kan het Premium-abonnement 7 dagen gratis uitproberen, zonder betaalkaart. Na de proefperiode stopt de toegang tot de betalende functies tot er een abonnement gekozen wordt.",
            "Lanceringsprijzen exclusief btw: Starter 69,99 € per maand of 699,90 € per jaar; Premium 129,99 € per maand of 1 299,90 € per jaar. De Belgische btw komt bovenop de prijs.",
            "De betaling verloopt via Stripe. Het abonnement wordt vooraf betaald en wordt aan het einde van elke periode automatisch verlengd, tegen de dan geldende prijs.",
            "U kunt op elk moment opzeggen in de applicatie: de opzegging gaat in aan het einde van de betaalde periode, zonder terugbetaling van de lopende periode.",
            "Wij kondigen elke prijsverhoging minstens 30 dagen vooraf aan; ze geldt vanaf de volgende periode en u kunt vooraf opzeggen.",
            "Omdat de abonnementen aan bedrijven verkocht worden, geldt het herroepingsrecht voor consumenten niet.",
          ],
        },
        {
          title: "6. Leveranciers",
          body: [
            "Een leverancier kan op een prijsaanvraag antwoorden via de link in de e-mail, zonder account. Antwoorden is gratis.",
            "Een ingediende offerte verbindt de leverancier tot de vermelde prijzen en voorwaarden, tot de geldigheidsdatum. De leverancier blijft verantwoordelijk voor zijn offerte, ook wanneer hij een pdf heeft toegevoegd en Nodi de prijzen heeft overgenomen: hij controleert het formulier voor hij het verstuurt.",
            "Mocht er een commissie op bestellingen ingevoerd worden, dan wordt het percentage getoond en uitdrukkelijk aanvaard vóór elke betrokken offerte. Ze geldt nooit voor reeds ingediende offertes.",
            "Een leverancier kan op elk moment stoppen met aanvragen ontvangen, met één klik in de e-mail of op de offertepagina.",
          ],
        },
        {
          title: "7. Nodi en artificiële intelligentie",
          body: [
            "Nodi gebruikt een model van artificiële intelligentie om vragen te beantwoorden, als pdf toegevoegde offertes te lezen, het nieuws te schrijven en berichten tussen aannemers en leveranciers te herformuleren of te vertalen. Contactgegevens worden uit doorgestuurde berichten verwijderd.",
            "Antwoorden van Nodi kunnen fouten bevatten. Ze vervangen geen professioneel advies (technisch, juridisch of fiscaal). Controleer altijd bedragen en belangrijke informatie.",
            "Het nieuws dat Nodi publiceert, vat artikels van externe bronnen samen, met vermelding van de link. Die bronnen blijven verantwoordelijk voor hun inhoud.",
          ],
        },
        {
          title: "8. Verboden gebruik",
          body: [
            "Het is onder meer verboden: onwettige, misleidende, beledigende inhoud te publiceren of inhoud die de rechten van anderen schendt; ongevraagde reclameberichten te sturen; gegevens van het platform massaal te kopiëren; te proberen toegang te krijgen tot accounts of gegevens van anderen; de werking van de dienst te verstoren; een account aan te maken voor een bedrijf dat u niet vertegenwoordigt.",
          ],
        },
        {
          title: "9. Uw inhoud",
          body: [
            "U blijft eigenaar van de inhoud die u plaatst (aanvragen, offertes, bestanden, berichten, logo). U geeft ons het recht die te hosten, te tonen aan de gekozen ontvangers en te verwerken voor zover nodig voor de werking van de dienst.",
          ],
        },
        {
          title: "10. Beschikbaarheid en aansprakelijkheid",
          body: [
            "Wij doen het nodige om BatiNode beschikbaar en veilig te houden, zonder een dienst zonder onderbreking of fouten te kunnen waarborgen. Er kan onderhoud plaatsvinden.",
            `Behalve bij opzet of zware fout is de aansprakelijkheid van ${O.name} beperkt tot rechtstreekse schade en tot de bedragen die uw bedrijf in de 12 maanden vóór het schadegeval aan BatiNode betaald heeft. Wij zijn niet aansprakelijk voor onrechtstreekse schade, zoals verlies van omzet, klanten of gegevens.`,
          ],
        },
        {
          title: "11. Opschorting en einde",
          body: [
            "U kunt op elk moment stoppen met BatiNode en de verwijdering van uw account vragen.",
            "Wij kunnen een account dat deze voorwaarden niet naleeft opschorten of sluiten, na een waarschuwing behalve bij hoogdringendheid (fraude, veiligheid, onwettige inhoud).",
          ],
        },
        {
          title: "12. Persoonsgegevens",
          body: [
            "De verwerking van persoonsgegevens wordt beschreven in het privacybeleid, dat deel uitmaakt van deze voorwaarden.",
          ],
        },
        {
          title: "13. Wijziging van de voorwaarden",
          body: [
            "Wij kunnen deze voorwaarden aanpassen. Elke belangrijke wijziging wordt minstens 30 dagen vooraf aangekondigd, per e-mail of in de applicatie. Gaat u niet akkoord, dan kunt u vóór die datum opzeggen.",
          ],
        },
        {
          title: "14. Toepasselijk recht en geschillen",
          body: [
            "Deze voorwaarden vallen onder het Belgisch recht. Bij onenigheid schrijft u ons eerst: wij zoeken een minnelijke oplossing.",
            "Lukt dat niet, dan zijn uitsluitend de rechtbanken van het gerechtelijk arrondissement Waals-Brabant bevoegd.",
          ],
        },
      ],
    },

    confidentialite: {
      title: "Privacybeleid",
      sections: [
        {
          title: "Verwerkingsverantwoordelijke",
          body: [
            `${P} is verantwoordelijk voor de verwerking van persoonsgegevens via BatiNode. Voor vragen of verzoeken: ${O.email}.`,
          ],
        },
        {
          title: "Welke gegevens",
          body: [
            "Account: naam, e-mailadres, telefoon, taal en wachtwoord (enkel versleuteld bewaard).",
            "Bedrijf: naam, btw-nummer, adres, openbare gegevens van de Kruispuntbank van Ondernemingen, logo, vakgebieden, werkgebied, grootte en de gegevens opgegeven bij de inschrijving.",
            "Activiteit: prijsaanvragen, offertes, bestelbonnen, documenten, bestanden, berichten, berichten in het netwerk en vragen aan Nodi.",
            "Betaling: het abonnement en zijn status. Kaartgegevens worden rechtstreeks door Stripe verwerkt; wij hebben er geen toegang toe.",
            "Technisch: verbindings- en foutlogboeken, IP-adres, voor de veiligheid van de dienst.",
            "Leveranciers: de gids bevat professionele contactgegevens van materiaalleveranciers (bedrijfsnaam, adres, professioneel e-mailadres en telefoon, activiteit), afkomstig uit openbare bronnen zoals hun website of de Kruispuntbank van Ondernemingen.",
          ],
        },
        {
          title: "Waarom en op welke grond",
          body: [
            "De dienst leveren (account, aanvragen, offertes, bestellingen, netwerk, abonnement): uitvoering van de overeenkomst.",
            "Facturatie en boekhouding: wettelijke verplichting.",
            "Bedrijven controleren, fraude voorkomen, het platform beveiligen: gerechtvaardigd belang bij een betrouwbaar netwerk.",
            "Prijsaanvragen doorsturen naar leveranciers uit de gids: gerechtvaardigd belang van aannemers en leveranciers om elkaar als professionals te vinden. Elke e-mail laat toe zich met één klik te verzetten.",
            "U informeren over de evolutie van de dienst: gerechtvaardigd belang; u kunt zich er altijd tegen verzetten.",
          ],
        },
        {
          title: "Wie uw gegevens ziet",
          body: [
            "Leveranciers die een aanvraag ontvangen, zien de naam, het btw-nummer en het adres van het aanvragende bedrijf en de inhoud van de aanvraag. De aannemer ziet de offertes en de naam van de leveranciers. Persoonlijke contactgegevens worden uit doorgestuurde berichten verwijderd.",
            "Onze verwerkers, enkel om BatiNode te laten werken: Supabase (database en bestanden, Frankfurt, EU), GitHub (hosting van de webapplicatie), Brevo (verzending van e-mails, Frankrijk), Stripe (betalingen) en Anthropic (het AI-model van Nodi). Volgens zijn commerciële voorwaarden gebruikt Anthropic deze gegevens niet om zijn modellen te trainen.",
            "Sommige van deze dienstverleners kunnen gegevens buiten de Europese Unie verwerken, met name in de Verenigde Staten. Die doorgiften gebeuren binnen het EU-VS-kader voor gegevensbescherming of met de standaardcontractbepalingen van de Europese Commissie.",
            "Wij verkopen uw gegevens nooit.",
          ],
        },
        {
          title: "Bewaartermijn",
          body: [
            "Account- en activiteitsgegevens worden bewaard zolang het account actief is, en binnen 30 dagen na een verzoek tot verwijdering gewist of geanonimiseerd, behalve wat de wet ons verplicht te bewaren (facturen en boekhoudstukken, gedurende de wettelijke termijn).",
            "Technische logboeken worden maximaal 12 maanden bewaard.",
            "De gegevens van een leverancier in de gids worden bewaard tot hij zich verzet; dan houden wij enkel bij wat nodig is om zijn weigering te respecteren.",
          ],
        },
        {
          title: "Uw rechten",
          body: [
            `U kunt inzage, verbetering, wissing, beperking van de verwerking en overdraagbaarheid van uw gegevens vragen, en u verzetten tegen verwerking op basis van ons gerechtvaardigd belang. Schrijf naar ${O.email}; wij antwoorden binnen een maand.`,
            "U kunt ook klacht indienen bij de Gegevensbeschermingsautoriteit, Drukpersstraat 35, 1000 Brussel (www.gegevensbeschermingsautoriteit.be).",
          ],
        },
        {
          title: "Beveiliging",
          body: [
            "Verbindingen zijn versleuteld (HTTPS), wachtwoorden zijn versleuteld, elk bedrijf heeft enkel toegang tot zijn eigen gegevens, bestanden zijn privé en openen enkel via tijdelijke links, en beheerderstoegang is beperkt.",
          ],
        },
      ],
    },

    cookies: {
      title: "Cookies en lokale opslag",
      sections: [
        {
          title: "Wat wij gebruiken",
          body: [
            "BatiNode gebruikt geen reclamecookies en geen tools voor bezoekersmeting.",
            "De applicatie bewaart in uw browser of op uw telefoon enkel wat nodig is om te werken: uw aanmeldsessie, de gekozen taal en enkele weergavevoorkeuren (bijvoorbeeld een concept van een aanvraag). Die zijn strikt noodzakelijk en vragen dus geen toestemming.",
          ],
        },
        {
          title: "Betaling",
          body: [
            "De betaalpagina wordt door Stripe op zijn eigen website aangeboden. Stripe gebruikt daar eigen cookies, nodig voor de veiligheid van de betaling en het voorkomen van fraude, volgens zijn eigen beleid.",
          ],
        },
        {
          title: "Ze wissen",
          body: [
            "U kunt deze gegevens op elk moment wissen door u af te melden of via de instellingen van uw browser. U moet zich daarna opnieuw aanmelden.",
          ],
        },
      ],
    },
    suppression: {
      title: "Uw BatiNode-account verwijderen",
      sections: [
        {
          title: "In de app",
          body: [
            "Open Instellingen, dan « Mijn account verwijderen », en bevestig. De verwijdering is onmiddellijk en definitief.",
          ],
        },
        {
          title: "Zonder de app",
          body: [
            `Schrijf naar ${O.email} vanaf het e-mailadres van uw account en vraag de verwijdering. Wij voeren ze binnen 30 dagen uit en bevestigen het u.`,
          ],
        },
        {
          title: "Wat verwijderd wordt",
          body: [
            "Uw toegang en uw persoonsgegevens. Bent u de laatste gebruiker van uw bedrijf: het abonnement wordt stopgezet, de bestanden, het logo, de oproepen en de gesprekken worden gewist.",
            "Wat bewaard blijft: de bestellingen, offertes en boekhoudstukken die uw partners of wijzelf wettelijk moeten bewaren, gedurende de wettelijke termijn, zonder uw contactgegevens.",
          ],
        },
      ],
    },
  },
};
