// TO DO & BUGS
// ----> Scoring/Gewichten tunen. Misschien X ipv +
// ----> Verkoop systeem maken. Met escape als de markt crashed. <--- Draait al. Dubbele escape maken op de hele markt trend
// ----> Bij aankoop inkopen als de munt laag onder de trend hangt (dus daarop wachten) <--- Fucking lastig... Moet nog
// ----> Bij verkoop verkopen als de munt hoog boven de trend zit (dus daarop wachten mits dat kan) <--- Fucking lastig... Moet nog
// ----> Tunen van de scoring gewichten voor elke munt en iedere trigger <--- Hier ook nog even over nadenken. Werkt aardig maar kan beter. Misschien in trapjes ipv 1 grote score.



require('dotenv').config()
const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const bitvavo = require('bitvavo')().options({
    APIKEY: process.env.KEY,
    APISECRET: process.env.SECRET,
    ACCESSWINDOW: 10000,
    RESTURL: 'https://api.bitvavo.com/v2',
    WSURL: 'wss://ws.bitvavo.com/v2/',
    DEBUGGING: false
  })
var ema = require('exponential-moving-average');
var sma = require('sma');
const { Console } = require('console')
const { VERSION } = require('ejs')
let limitRemaining;
let ticker24hr = [];
let ticker24hrTimestamp;
let marketSumOfPrices; // een beveiliging om een crashende markt te vinden... Totaal van alle laatste prijzen opgeteld
let marketSumOfPricesOld;
let smaMarketSum;
let wholeMarketTrend;
let wholeMarketTrend2min;
let MarketSumArray = [];
let MarketSumArrayTimes =[];
let timeStamps = [];
let smaShortPeriod = 2;
let smaMediumPeriod = 6;
let smaLongPeriod = 20; //Geen idee waarom maar 210 is de langste periode mogelijk....
let checkDelayTimer = 0;
let allCoins = []; //Multi dimensional array of all coins and prices and trends.. Gonna be HUGE!!
let buildALLCOINS = 0;
let coinHeroName;
let loopinterval = 5; //Loop interval in seconden

//Virtuele coin om te testen...
let geldEUR = 1000;
let feeFactor = 1.002;
let aankoopArray = [];
let digiEUR = 0;

//Setting the format for the Simple Moving Averager
var format = function(n) {
  return n.toFixed(8);
};

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})
// Haal bij opstarten van de server alle Ticker24hr data van bitvavo
// Dit is belangrijk om een historisch uitgangspunt te vinden

// Array ticker24hr = [market,open,high,low,last]

bitvavo.ticker24h({}, (error, response) => {
  if (error === null) {
    for (let object of response) {
      //console.log(object)
      ticker24hr.push([object.market,parseFloat(object.open),parseFloat(object.high),parseFloat(object.low),parseFloat(object.last)])
    }
    console.log('ticker24hr is opgehaald na opstarten Server')
    ticker24hrTimestamp = Date.now() // Sla de tijd op zodat we later de ticker24hr kunnen verversen met nieuwe data
  } else {
    console.log(error)
  }
})
// Vernieuw elke 5 minuten (300000ms) de ticker24hr data en sla de marketSumOfPrices op
setInterval(function(){ 
  bitvavo.ticker24h({}, (error, response) => {
    if (error === null) {
      for (let object of response) {
        //console.log(object)
        ticker24hr.push([object.market,parseFloat(object.open),parseFloat(object.high),parseFloat(object.low),parseFloat(object.last)])
      }
      console.log('ticker24hr is bijgewerkt')
      ticker24hrTimestamp = Date.now() // Sla de tijd op zodat we later de ticker24hr kunnen verversen met nieuwe data in dien nodig
    } else {
      console.log(error)
    }
  })
marketSumOfPricesOld = marketSumOfPrices
},300000); // Elke 5 minuten word de ticker24hr data bijgewerkt

// Haal elke X seconden alle prijs data van de markt via websockets stream
function intervalFunc() {  
  // options: market
  marketSumOfPrices = 0;
  bitvavo.websocket.tickerPrice({})    
}


//bitvavo.websocket.subscriptionTicker('', (response) => {
//  console.log('Subscription Ticker response', response)
//})

setInterval(intervalFunc,loopinterval*1000);

bitvavo.getEmitter().on('tickerPrice', (response) => {
  
  for (let entry of response) {
    
    //HIERONDER HET BOUWEN VAN EEN ARRAY OBJECT MET ALLE COINS EN PRIJZEN
    //buildALLCOINS is een opstart mechanisme om de array op te bouwen from scratch
    //Nieuwe munten worden alleen toegevoegd na opnieuw opstarten server!!!!!!
    //marketSumOfPrices = 0
    marketSumOfPrices += parseFloat(entry.price)
    // PLANNED --> Deze som in een array stoppen en er de SMA overheen halen voor trend indicatie
    if (buildALLCOINS === 0)
    { 
      allCoins.push([entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','smaLong + of -', '24hrsPercentage', 'ScoringsGewicht', '1hrsPercentage', 'RSI']);
    } else {
      for (let i = 0; i < allCoins.length; i++) {
        var lastprice = allCoins[i][1][allCoins[i][1].length-1]
        if (allCoins[i][0] === entry.market && lastprice != parseFloat(entry.price)) { 
          allCoins[i][1].push(parseFloat(entry.price))
          allCoins[i][2].push(Date.now())
          if (allCoins[i][1].length > 2000) { allCoins[i][1].shift() }
          if (allCoins[i][2].length > 2000) { allCoins[i][2].shift() }
          // Hieronder stoppen we de SMA's in de allCoins array
          // Alsmede de stijging adhv de lopende gemiddeldes SMA's    
          var avgShort = sma(allCoins[i][1],smaShortPeriod,format);
          var avgMedium = sma(allCoins[i][1],smaMediumPeriod,format);
          var avgLong = sma(allCoins[i][1],smaLongPeriod,format);          
    //Hieronder vullen de de SMA arrays aan met met huidige prijs om de array even lang te maken als
    //de allCoins[0][1] prices array om deze passend op een grafiek te krijgen in de frontend
    //Bij lange periodes voor SMA werkt onderstaand niet.... Waarom geen idee...
    for (let a = 1; a < smaShortPeriod; a++) {
      avgShort.unshift(allCoins[i][1][allCoins[i][1].length-1]);
    }
    
    for (let b = 1; b < smaMediumPeriod; b++) {
      avgMedium.unshift(allCoins[i][1][allCoins[i][1].length-1]);
    }
  
    for (let c = 1; c < smaLongPeriod; c++) {
      avgLong.unshift(allCoins[i][1][allCoins[i][1].length-1]);
    }
    if (avgShort.length > 0) {allCoins[i][3] = parseFloat(avgShort[avgShort.length-1])}; //Zet laatste shortSMA in allCoins
    if (avgMedium.length > 0) {allCoins[i][4] = parseFloat(avgMedium[avgMedium.length-1])};// Zet laatse mediumSMA in allCoins
    if (avgLong.length > 0) {allCoins[i][5] = parseFloat(avgLong[avgLong.length-1])};// Zet laatste longSMA in allCoins
    //if (avgLong.length > 1) {allCoins[i][8] = parseFloat(avgLong[avgLong.length-2])};// Zet de ena laatste longSMA in allCoins
    var stijging = ((allCoins[i][3]-allCoins[i][5])/allCoins[i][5]) * 100; // Stijging tov longSMA
    var stijgingmedium = ((allCoins[i][4]-allCoins[i][5])/allCoins[i][5]) * 100; // Stijging tov longSMA
    //wholeMarketTrend = ((smaMarketSum[smaMarketSum.length-1]-smaMarketSum[0])/smaMarketSum[smaMarketSum.length-1] * 100); // percentage trend
    var stijgingLong = ((parseFloat(avgLong[avgLong.length-1]) - parseFloat(avgLong[0])) / parseFloat(avgLong[avgLong.length-1])) * 100; // Stijging van Long SMA in %
    if ( stijging != NaN) { allCoins[i][6] = parseFloat(stijging.toFixed(4)) } // Stop de stijging shorttov long in allCoins
    if ( stijgingmedium != NaN) { allCoins[i][7] = parseFloat(stijgingmedium.toFixed(4)) }// Stop de stijging medium tov long in allCoins
    if ( stijgingLong != undefined) { allCoins[i][8] = parseFloat(stijgingLong.toFixed(4)) }// Stop de stijging van long tov longtrend in allCoins
    //Hieronder stoppen we de 1 uurs trend percentage in de allCoins array die ook meedoet in de scoring
    if ( allCoins[i][1].length * loopinterval < 3600) {
      var hr_oud = allCoins[i][1][0]
      var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][11] = parseFloat(hr_percentage)
    } else {
      var hr_oud = allCoins[i][1][3600 / loopinterval]
      var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][11] = parseFloat(hr_percentage)
    }
    // Array ticker24hr = [market,open,high,low,last]
    for (let d = 0; d < ticker24hr.length; d++) {
      if ( ticker24hr[d][0] === allCoins[i][0] ){
        var oud = ticker24hr[d][1]
        var nieuw = allCoins[i][1][allCoins[i][1].length-1]
        var percentage = ((parseFloat(nieuw)-parseFloat(oud))/parseFloat(oud)) * 100
        allCoins[i][9] = percentage
        //console.log('oud ' + oud + ' nieuw ' + nieuw + ' % ' + percentage)
      }
    }
    //////////   CALCULATIING THE RSI ( RELATIVE STRENGHT INDEX ) for all the coins
    //// period = longSMA period
    if (buildALLCOINS > smaLongPeriod) {
    var upmoves = []
    var downmoves = []
    if ( allCoins[i][1].length < (smaLongPeriod + 1) ) { var RSIperiodeIndex = 0 }
    if ( allCoins[i][1].length >= (smaLongPeriod + 1) ) { var RSIperiodeIndex = allCoins[i][1].length-smaLongPeriod }
    for (let e = RSIperiodeIndex; e < allCoins[i][1].length; e++) {
      var upchange1 = allCoins[i][1][e] - allCoins[i][1][e-1]
      var upchange = parseFloat(upchange1)
      if (upchange === NaN) { upchange = 0 }
      //console.log(' RSIperiod = ' + RSIperiodeIndex + 'upchange = ' + upchange)
      //console.log(allCoins[i][1][e])
      if ( upchange > 0) {
      upmoves.push(parseFloat(upchange))
      downmoves.push(0)
      }
      if ( upchange < 0) {
        var change =  parseFloat(upchange)
        downmoves.push(Math.abs(change))
        upmoves.push(0)
      }
      if (upchange === 0 ) {
        downmoves.push(0)
        upmoves.push(0)
      }
    }
      var AVGU = sma(upmoves,smaLongPeriod,format)
      var AVGD = sma(downmoves,smaLongPeriod,format)
      var RS = parseFloat(AVGU) / parseFloat(AVGD)
      var blok3 = 1 + RS
      var blok2 = 100 / blok3
      var RSI = 100 - blok2
      allCoins[i][12] = parseFloat(RSI)
      //console.log('RS = ' + RS + 'RSI = ' + RSI)
  }
    //Vanaf hier gaan we de munten scoren, een gewicht geven met alles wat we nu weten
    //  * De munt moet een opgaande trend hebben tov een dag terug (historie binnenhalen via ticker24hr)--> AF allCoins[i][9] in %
    //  * De munt moet een opgaande trend hebben tov 1 hr terug (Om te voorkomen dat je een munt koopt in resistance) --> AF allCoins[i][11]
    //  * De munt moet een opgaande trend hebben (allCoins[i][8] moet positief zijn)--> AF
    //  * De hele markt moet stabiel zijn of stijgen. (Niet inkopen als de markt crashed!) -->AF wholeMarketTrend
    //
    //  In plaats van optellen zou er ook gekozen kunnen worden om te vermenigvuldigen van de scores. Dit leverd waarschijnlijk
    //  een betrouwbaarder resultaat op. Maar het werkt nu op zich al goed. Alleen is de 24hrs trend misschien iets te sterk.
    var score24hrsTrend = parseFloat(allCoins[i][9]) * 0.2  // was 10.
    var score1hrsTrend = parseFloat(allCoins[i][11]) * 4  //
    var scoreLongTrend = parseFloat(allCoins[i][8]) * 4  // Was 2 (om te voorkomen dat je munten koopt in resistance)
    var scoreWholeMarket =  parseFloat(wholeMarketTrend) * 100 // Deze weegt extra zwaar om kopen in een neergaande totaal markt te voorkomen
    allCoins[i][10] = score24hrsTrend + score1hrsTrend + scoreLongTrend + scoreWholeMarket
    if (aankoopArray.length > 0) {      
      if (allCoins[i][0] === aankoopArray[0][0]){
        digiEUR = (allCoins[i][1][allCoins[i][1].length-1] * aankoopArray[0][2]) + geldEUR
        io.sockets.emit('BuyStatus', aankoopArray, digiEUR, allCoins[i][1] ,avgShort, avgMedium, avgLong, allCoins[i][2], allCoins[i][10], allCoins[i][11], allCoins[i][9], allCoins[i][12])        
    }
  }
        };        
      }       
    }    
  } //Vanaf hier zijn we uit de LOOP...............
  //console.log('BTC Check ' + allCoins[20][1])
  //console.log(allCoins[20][12] + ' RSI en loop counter = ' + buildALLCOINS)
  //console.log('24Hrs % van ' + allCoins[20][0] + ' = ' + allCoins[20][9] + '. Met SCORE van ' + allCoins[20][10])
    // io.sockets.emit('BuyStatus', aankoopArray, digiEUR, allCoins[i][1] ,avgShort, avgMedium, avgLong, allCoins[i][2])

    // Vanaf hier alles verbouwen...

    // Er moet minder gerekend worden op de korte termijn om spontane verkoop of valse aankoop te voorkomen
    // Hierbij gaan we alle munten een score geven (een gewicht)
    //  * De munt moet een opgaande trend hebben tov een dag terug (historie binnenhalen via ticker24hr)--> AF allCoins[i][9] in %
    //  * De munt moet een opgaande trend hebben (allCoins[i][8] moet positief zijn)--> AF
    //  * De hele markt moet stabiel zijn of stijgen. (Niet inkopen als de markt crashed!) -->AF wholeMarketTrend
    //  * Bij inkoop moet er ingekocht worden als de prijs het verst onder de trend ligt om te maximaliseren --> AF laatste prijs tov allCoins[i][5]
    //  * Bij verkoop moet er verkocht worden als de prijs ver boven de trend ligt om te maximaliseren --> AF laatste prijs tov allCoins[i][5]
    // 
    // Safety systeem moet gebouwd worden : ---> AF
    //  * De gehele markt moet getoets worden op trend --> AF wholeMarketTrend (Inkoop en Verkoop trigger)
    //  * Dit kan door alle munten op te tellen en te vergelijken met een stap eerder
    //  Hiermee kan een goede markt worden aangetoond om te investeren
    //  Maar nog belangrijker kun je op tijd uitstappen als de markt crashed.....
    //
    // Als inkoop optie kun je bij kopen als de prijs in een diepte punt zit.
    // Hiermee haal je de gemiddelde aankoop prijs omlaag en maximaliseer je nog verder.
    //
    // De trends (SMA's) werken alleen goed als de periode lang genoeg is. bv 20, 50, 200 bij elke 10 seconden update.
    //
    // Wat ik eerder had bedacht werkt ook maar niet goed genoeg.
    //
  
  // Hieronder een veiligheids systeem. Het programma houd de hele markt in de gaten. Dat wil zeggen alle coins.
  // Wanneer de markt inelkaar stort kan de investering terug worden getrokken om verliezen te voorkomen.
  // Ook is de hele markt trend een aankoop en verkoop trigger en zit deze verweven in het scoringssysteem van elke munt. 
  //
  MarketSumArray.push(parseFloat(marketSumOfPrices)) // Stop de market som of prijces in een array voor SMA berekening
  MarketSumArrayTimes.push(Date.now())
  smaMarketSum = sma(MarketSumArray,smaShortPeriod,format); // Bereken de SMA over de marketSum
  if (MarketSumArray.length > 100) { MarketSumArray.shift() } // Hou de array kort
  if (MarketSumArrayTimes.length > 100) { MarketSumArrayTimes.shift() } // Hou de array kort
  if (smaMarketSum.lenght > 100) { smaMarketSum.shift() } // Hou de array kort
  wholeMarketTrend = ((smaMarketSum[smaMarketSum.length-1]-smaMarketSum[0])/smaMarketSum[smaMarketSum.length-1] * 100); // percentage trend
  var TwoMinutes = 120 / loopinterval
  wholeMarketTrend2min = ((smaMarketSum[smaMarketSum.length-1]-smaMarketSum[smaMarketSum.length-TwoMinutes])/smaMarketSum[smaMarketSum.length-1] * 100);
  //console.log('Som van Prijzen = ' + marketSumOfPrices.toFixed(1) + '. Whole Market Trend = ' + wholeMarketTrend.toFixed(2) + ' %')
  io.sockets.emit('MarketStatus', MarketSumArray, MarketSumArrayTimes, wholeMarketTrend)
  //Hieronder halen we de tijd binnen van de bitvavo server. Maar omdat die in Frankfurt staat
  //kun je net zo goed de servertijd nemen met Date.now(). Oftewel lokale computer tijd.
  //We halen ook de API call limiet binnen met limitRemaining = bitvavo.getRemainingLimit().
  bitvavo.time((error, response) => {
    if (error === null) {
      timeStamps.push(response.time)    
      buildALLCOINS += 1;
      checkDelayTimer += 1;      
      limitRemaining = bitvavo.getRemainingLimit()
    } else {
      console.log('Handle the error here', error)
    }
    
  })
  //Virtueel handelssysteem om te testen
  //if ( aankoopArray.length > 0 ) ( console.log('Test de aankoopArray ' + aankoopArray[0][0]))
  if ( aankoopArray.length < 1 && checkDelayTimer > 2 && buildALLCOINS > smaLongPeriod + 10 ){
  checkBuy();
  }
  if ( aankoopArray.length > 0 && checkDelayTimer > 2 ){ 
  checkSell();
  }
  //io.sockets.emit('Status', buildALLCOINS, coinHeroName)
  //console.log(allCoins[24])
  
})



// Virtueel handelssysteem om te testen en te tweaken checkStatus, buy and sell
//   Hier moet ie de beste munten scannen en inkopen als de prijs ver onder de long SMA ligt
//   om de meeste potentiele winst uit een munt te persen. <---- Dat is allCoins[i][12], de RSI.
function checkBuy() {
  var besteMunt = -10000;
  var besteMuntData = [];
  if (wholeMarketTrend > 0 && buildALLCOINS > smaLongPeriod ) {
    for (let i = 0; i < allCoins.length; i++) {
      if ( allCoins[i][10] > besteMunt && allCoins[i][10] > 0 && allCoins[i][12] < 30 && allCoins[i][12] > 0 && allCoins[i][1].length > smaLongPeriod) {
        besteMunt = allCoins[i][10]
        besteMuntData = allCoins[i]
        console.log(besteMuntData)
      }
  }
  if (aankoopArray.length < 1) { buy(besteMuntData) }    
}
console.log(besteMuntData)
console.log(aankoopArray.length)

}
// Deze tweaken en testen
//
// checkSell() moet de aangekochte munt testen op verkoop 'gewicht'. Hierbij kan gedacht worden aan
// --> Meten of de munt nog steeds goed scoort voor aankoop
// --> De markt toetsen op dalingen
// --> De munt zelf toetsen na winst. Een verkoop bij winst moet wel uit kunnen qua fee's
// --> Testen op resistance, higher highs higher lows, lower highs lower lows.  ---> Te moeilijk......
//
//allCoins.push([entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','smaLong + of -', '24hrsPercentage', 'ScoringsGewicht', '1hrsPercentage'])
//Waarschijnlijk is het beter om op puur arbitrage een verkoop beslissing te maken
//  ??? Keldert de markt hard
//  ??? Zit ik boven mijn winst target of onder mijn verlies target
//  ??? Zijn er andere munten waar ik beter mijn geld in kan stoppen
//  ??? Stijgt de munt uberhaupt wel


function checkSell() {
  
  for (let i = 0; i < allCoins.length; i++) {
    if ( aankoopArray.length > 0 ) {
    if ( allCoins[i][0] === aankoopArray[0][0] ) {
      //Scorings systeem verkoop
      //var scoreShortSterkte = allCoins[i][6] * 1 // De sterkte van de short trend boven de lange trend SMA ( stijgt de munt sterk? )
      //var scoreMediumSterkte = allCoins[i][7] * 1 // De sterkte van de medium trend boven de lange trend SMA ( stijgt de munt sterk? )
      var scoreLongTrendPercent = allCoins[i][8] * 2 // De sterkte van de lange trend SMA
      var scoreWholeMarket2min = wholeMarketTrend2min * 2 // De sterkte van de korte hele markt trend.
      //var vorigePrijs = allCoins[i][1][allCoins[i][1].length-smaLongPeriod]
      var vorigePrijs = aankoopArray[0][1]
      var laatstePrijs = allCoins[i][1][allCoins[i][1].length-1]
      var scrorePrijsPercentage = ((laatstePrijs - vorigePrijs) / laatstePrijs) * 100 // Score op basis van prijs verandering
      // We pakken het percentuele verschil tussen aankoop prijs en huidige prijs ( vorigePrijs en laatstePrijs )
      var verkoopScore = scoreLongTrendPercent + scoreWholeMarket2min + scrorePrijsPercentage
      aankoopArray[0][3] = parseFloat(verkoopScore)
      //console.log( verkoopScore )
      console.log( 'aankoop naam= ' + aankoopArray[0][0] + '. Verkoop score = ' + verkoopScore + '. RSI = ' + allCoins[i][12] + '. scorePrijsPercentage = ' + scrorePrijsPercentage)
      //We verkopen als de markt crashed...
      if ( aankoopArray.length > 0 && scoreWholeMarket2min < -5 ) { 
        io.sockets.emit('Sell', 'The market crashed, Trying to save your EUROS', scoreWholeMarket2min)
        sell(aankoopArray[0],allCoins[i])
         
      }
      //We verkopen als de munt goed gestegen is en de lange trend naar beneden zakt op een hoog moment
      if ( aankoopArray.length > 0 && scrorePrijsPercentage > 2 && scoreLongTrendPercent <= 0 && allCoins[i][12] > 70 && allCoins[i][12] < 100) {
        io.sockets.emit('Sell', 'Sold due to making good revenue but long trend is diving.', scoreLongTrendPercent)  
        sell(aankoopArray[0],allCoins[i])
        
      }
      //We verkopen als de totale verkoopscore erg laag is
      if ( aankoopArray.length > 0 && aankoopArray[0][3] < -5 && allCoins[i][12] > 70 && allCoins[i][12] < 100) {
        io.sockets.emit('Sell', 'The coin was too weak. Sold it.', aankoopArray[0][3]) 
        sell(aankoopArray[0],allCoins[i])
         
      }
    }
  }
}
}

function buy(coindata) {
  console.log('Im Trying to buy ' + coindata[0] + ' with price ' + coindata[1])
  try {
  
  var prices = coindata[1]
  var price = parseFloat(prices[prices.length-1])
  var name = coindata[0]
  geldEUR = geldEUR / feeFactor  
  var aankoophoeveelheid = geldEUR / price
  geldEUR = geldEUR - (aankoophoeveelheid * price)
  aankoopArray.push([name,price,parseFloat(aankoophoeveelheid),'verkoopScore'])
  console.log('Ingekocht munt ' + name + ' hoeveelheid = ' + aankoophoeveelheid + ' voor prijs: ' + price +'. En SCORE = ' + coindata[10] + '. En RSI = ' + coindata[12] )
  console.log('Saldo Euro = ' + geldEUR)
  console.log(aankoopArray)
  checkDelayTimer = 0;
  io.sockets.emit('Buy', 'I Bought ' + aankoopArray[0][0] + ' on price ' + aankoopArray[0][1].toFixed(3) + ' in amounts of ' + aankoopArray[0][2].toFixed(3))
}
catch(err) {
  console.log(err.message);
}
  
}

function sell(aankoopdata,verkoopdata) {
  var buyPrice = aankoopdata[1]
  var sellPrices = verkoopdata[1]
  var sellPrice = sellPrices[sellPrices.length-1]
  var geld = sellPrice * aankoopdata[2]
  var geldFee = geld / feeFactor
  geldEUR += geldFee  
  aankoopArray = []  
  console.log('Munt verkocht: ' + aankoopdata[0] + ' Buy= ' + buyPrice + ' Sell= ' + sellPrice)
  console.log('Saldo Euros = ' + geldEUR)
  console.log(aankoopArray)
  checkDelayTimer = 0;
}

io.on('connection', socket => {
  
    socket.emit('user-connected')

    socket.on('disconnect', () => {
        socket.emit('user-connected')
    
    })    
})



server.listen(3000, '0.0.0.0')