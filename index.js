// TO DO & BUGS

// Zie GITHUB issues... https://github.com/DennisTer/GeldMachine/issues/

// FORMULE VERSCHIL IN PROCENTEN -----> ((Nieuw - oud) / oud) * 100 .... Niet weer vergeten gloeiende gloeiende!!!!

// Server STATUS maken zodat je kan zien wat er gaande is... 

// Als er een munt gekocht is toch door scannen blijven op betere..... Kan handig zijn!


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
let smaShortPeriod = 10;
let smaMediumPeriod = 30;
let smaLongPeriod = 80; //Geen idee waarom maar 210 is de langste periode mogelijk....
let checkDelayTimer = 0;
let aankoopTimer = 0;
let allCoins = []; //Multi dimensional array of all coins and prices and trends.. Gonna be HUGE!!
let buildALLCOINS = 0;
let coinHeroName;
let loopinterval = 5; //Loop interval in seconden
let score24hrsTrendFactor = 2
let score1hrsTrendFactor = 50
let scoreLongTrendFactor = 80
let scoreWholeMarketFactor = 2
let score6hrsTrendFactor = 10
let score30minTrendFactor = 10
let score10minTrendFactor = 10
let lowRSI = 47;
let verkoopFactor1 = 50 // factor scoreLongTrendPercent // Buiten gebruik
let verkoopFactor2 = 10 // factor scoreWholeMarket2min // Buiten gebruik
let verkoopFactor3 = 40 // factor scoreAankoopPrijsPercentage // Buiten gebruik
let marktkooppercentage = -0.2 // Percentage markt trend waar boven er gekocht mag worden
let L1 = 0.4 // Percentage waarboven de prijs meelift in CheckSell
let L2 = -0.5 // Percentage van de totale markt trend. Bij markt crash verkopen we alles.....
let L3 = -3 // Percentage waarbij verkocht word als de prijs is gezakt...

let laatsteMunt = 'een munt'

let besteMunt
let besteMuntData
let besteMunt2
let besteMuntData2
let besteMunt3
let besteMuntData3
let besteMunt4
let besteMuntData4
let besteMunt5
let besteMuntData5

//Virtuele coin om te testen...
let geldEUR = 1000;
let feeFactor = 1.0025; // Standaard fee Bitvavo transacties
let aankoopArray = [];
let digiEUR = 0;

//Initiele opstart variabellen.... Om de status binnen te haen van Bitvavo
let takerFee
let makerFee
let balanceEuro
let balanceCoin
let balanceInOrder
let currentCoin
let currentCoinFull
let currentCoin_buyPrice
let currentCoin_buyAmount
let currentCoin_buyDate


//Setting the format for the Simple Moving Averager
var format = function(n) {
  return n.toFixed(8);
};

//Server Cache voor berichten
let berichten = []

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})

//Haal de fees op na opstarten
bitvavo.account((error, response) => {
  if (error == null) {
    takerFee = parseFloat(response.fees.taker)
    makerFee = parseFloat(response.fees.maker)
    //console.log(response)
    console.log('Fees taker = ' + takerFee + ' maker = ' + makerFee)
  } else {
    console.log(error)
  }
})
//Haal de balance op na opstarten. Balance in Euro en in Coin // Er vanuit gaande dat ik maar 1 munt heb
bitvavo.balance({}, (error, response) => {
  if (error === null) {
    for (let object of response) {
      if (object.symbol === 'EUR') { balanceEuro = parseFloat(object.available) }
      if (object.symbol != 'EUR' && object.available !=  '0') { 
        balanceCoin = parseFloat(object.available)
        balanceInOrder = parseFloat(object.inOrder)
        currentCoin = object.symbol 
      }
    }
    //console.log(response)
    console.log('Balance Euro = ' + balanceEuro)
    console.log('Balance Coin = ' + balanceCoin + ' Coin name = ' + currentCoin)
    console.log('Balance in order = ' + balanceInOrder)
    geldEUR = balanceEuro

    if ( currentCoin != '' ) {
      var string = currentCoin + '-EUR'
      bitvavo.trades(string, {}, (error, response) => {
        if (error === null) {
          currentCoin_buyPrice = parseFloat(response[0].price)
          currentCoin_buyAmount = parseFloat(response[0].amount)
          currentCoin_buyDate = parseFloat(response[0].timestamp)
          currentCoinFull = response[0].market
          //console.log(response)
          console.log('Aankoop prijs = ' + currentCoin_buyPrice)
          aankoopArray.push([currentCoinFull,currentCoin_buyPrice,currentCoin_buyAmount,'verkoopScore',currentCoin_buyPrice])
        } else {
          console.log(error)
        }
      })
    }
  } else {
    console.log(error)
  }
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
  aankoopTimer += loopinterval / 60 // Aankoop timer. Hoelang een munt is aangekocht in minuten
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
      allCoins.push([entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','smaLong + of -', '24hrsPercentage', 'ScoringsGewicht', '1hrsPercentage', 'RSI', '6hrspercentage', '30minpercentage', '10minpercentage']);
    //....................0.....................1.................2..........3.......4........5..........6.............7..................8................9.................10..................11..........12.........13..............14...................15
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
    if ( avgLong.length > 101 ) {
    var stijgingLong = ((parseFloat(avgLong[avgLong.length-1]) - parseFloat(avgLong[avgLong.length-100])) / parseFloat(avgLong[avgLong.length-100])) * 100; // Stijging van Long SMA in %
    } else {
      var stijgingLong = ((parseFloat(avgLong[avgLong.length-1]) - parseFloat(avgLong[avgLong.length-2])) / parseFloat(avgLong[avgLong.length-2])) * 100; // Stijging van Long SMA in %  
     }
    
    
    if ( stijging != NaN) { allCoins[i][6] = parseFloat(stijging.toFixed(4)) } // Stop de stijging shorttov long in allCoins
    if ( stijgingmedium != NaN) { allCoins[i][7] = parseFloat(stijgingmedium.toFixed(4)) }// Stop de stijging medium tov long in allCoins
    if ( stijgingLong != undefined) { allCoins[i][8] = parseFloat(stijgingLong.toFixed(4)) }// Stop de stijging van long tov longtrend in allCoins
    //Hieronder stoppen we de 1 uurs trend percentage in de allCoins array die ook meedoet in de scoring
    var datenow = new Date()
    var date6HrBack = datenow - (6*60*60*1000); // date in ms 6 uur terug
    var date1HrBack = datenow - (1*60*60*1000); // date in ms 1 uur terug
    var date30minBack = datenow - (0.5*60*60*1000); // date in ms half uur terug
    var date10minBack = datenow - (0.17*60*60*1000); // date in ms 10 min terug

    // Hieronder zoeken we de timestamp in ms die het dichts bij 1 uur terug ligt
    // Uiteraard zal de Geldmachine een uur moeten draaien voordat deze waarde ook daadwerkelijk 1 uur terug is
    var indexArr = allCoins[i][2].map(function(k) { return Math.abs(k - date1HrBack) })
    var min = Math.min.apply(Math, indexArr)
    var indexof1HrBack = indexArr.indexOf(min)
    
    var indexArr2 = allCoins[i][2].map(function(k) { return Math.abs(k - date6HrBack) })
    var min2 = Math.min.apply(Math, indexArr2)
    var indexof6HrBack = indexArr2.indexOf(min2)
    
    var indexArr3 = allCoins[i][2].map(function(k) { return Math.abs(k - date30minBack) })
    var min3 = Math.min.apply(Math, indexArr3)
    var indexofhalfHrBack = indexArr3.indexOf(min3)

    var indexArr4 = allCoins[i][2].map(function(k) { return Math.abs(k - date10minBack) })
    var min4 = Math.min.apply(Math, indexArr4)
    var indexof10minBack = indexArr4.indexOf(min4)
    // Deze 1Hr terug trend in % zou uitgebreid kunnen worden met een 30 min trend % en een 15 min trend %
    // Zo zou je munten kunnen vinden die vanuit een diep dal ineens gaan stijgen...    
      var hr_oud = allCoins[i][1][indexof1HrBack]
      var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][11] = parseFloat(hr_percentage)
     // 6 uurs percentage
      var hr_oud = allCoins[i][1][indexof6HrBack]
      //var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][13] = parseFloat(hr_percentage)
     // 30 minuten percentage
      var hr_oud = allCoins[i][1][indexofhalfHrBack]
      //var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][14] = parseFloat(hr_percentage)
     // 10 minuten percentage
      var hr_oud = allCoins[i][1][indexof10minBack]
      //var hr_nieuw = allCoins[i][1][allCoins[i][1].length-1]
      var hr_percentage = ((hr_nieuw - hr_oud) / hr_oud) * 100
      allCoins[i][15] = parseFloat(hr_percentage)
    
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
    var score24hrsTrend = parseFloat(allCoins[i][9]) * score24hrsTrendFactor  // was 10.
    var score1hrsTrend = parseFloat(allCoins[i][11]) * score1hrsTrendFactor  //
    var scoreLongTrend = parseFloat(allCoins[i][8]) * scoreLongTrendFactor  // Was 2 (om te voorkomen dat je munten koopt in resistance)
    var scoreWholeMarket =  parseFloat(wholeMarketTrend) * scoreWholeMarketFactor // Deze weegt extra zwaar om kopen in een neergaande totaal markt te voorkomen
    var score6HrTrend = parseFloat(allCoins[i][13]) * score6hrsTrendFactor
    var score30minTrend = parseFloat(allCoins[i][14]) * score30minTrendFactor
    var score10minTrend = parseFloat(allCoins[i][15]) * score10minTrendFactor
    allCoins[i][10] = score24hrsTrend + score1hrsTrend + scoreLongTrend + scoreWholeMarket + score6HrTrend + score30minTrend + score10minTrend
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
  
  // Hieronder een veiligheids systeem. Het programma houd de hele markt in de gaten. Dat wil zeggen alle coins.
  // Wanneer de markt inelkaar stort kan de investering terug worden getrokken om verliezen te voorkomen.
  // Ook is de hele markt trend een aankoop en verkoop trigger en zit deze verweven in het scoringssysteem van elke munt. 
  //
  MarketSumArray.push(parseFloat(marketSumOfPrices)) // Stop de market som of prijces in een array voor SMA berekening
  MarketSumArrayTimes.push(Date.now())
  smaMarketSum = sma(MarketSumArray,smaShortPeriod,format); // Bereken de SMA over de marketSum
  if (MarketSumArray.length > 1000) { MarketSumArray.shift() } // Hou de array kort
  if (MarketSumArrayTimes.length > 1000) { MarketSumArrayTimes.shift() } // Hou de array kort
  if (smaMarketSum.lenght > 1000) { smaMarketSum.shift() } // Hou de array kort
  wholeMarketTrend = ((smaMarketSum[smaMarketSum.length-1]-smaMarketSum[0])/smaMarketSum[0] * 100); // percentage trend
  var TwoMinutes = 1200 / loopinterval // Made it 20 minutes
  wholeMarketTrend2min = ((smaMarketSum[smaMarketSum.length-1]-smaMarketSum[smaMarketSum.length-TwoMinutes])/smaMarketSum[smaMarketSum.length-TwoMinutes] * 100);
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
  // De checkDelayTimer kan van pas komen om een pauze tussen verkoop en aankoop in te lassen. Staat nu op 2 seconden
  if ( checkDelayTimer > 2 && buildALLCOINS > (smaLongPeriod + 10) ){
  checkBuy();
  }
  if ( aankoopArray.length > 0 && checkDelayTimer > 2 ){ 
  checkSell();
  }
  // Hoe de berichten array kort tot 20 vergaande berichten
  if (berichten.length > 20) { berichten.shift() }
  
})



// Virtueel handelssysteem om te testen en te tweaken checkStatus, buy and sell
//   Hier moet ie de beste munten scannen en inkopen als de prijs ver onder de long SMA ligt
//   om de meeste potentiele winst uit een munt te persen. <---- Dat is allCoins[i][12], de RSI.
function checkBuy() {
  besteMunt = -10000;
  besteMuntData = [];
  if (wholeMarketTrend > marktkooppercentage && buildALLCOINS > smaLongPeriod ) {
    //We testen hieronder of het een munt betreft XXX-EUR en niet een munt naar munt
    var patt = new RegExp("-EUR");    
    for (let i = 0; i < allCoins.length; i++) {
      var res = patt.test(allCoins[i][0]);
      if ( res === true && allCoins[i][12] > 0 && allCoins[i][10] > 0) { //Als het een XXX-EUR munt is en als er een RSI is EN een positieve score heeft.
            if ( allCoins[i][10] > besteMunt && allCoins[i][10] > 0 ) {
              besteMunt = allCoins[i][10]
              //allCoins[i][13] = parseFloat(i) // Hier gaat de RATING in de allCoins array
              besteMuntData = allCoins[i]
            }
      }      
  }
  besteMunt2 = -10000;
  besteMuntData2 = [];
  if (besteMunt > -10000) {
    //We testen hieronder of het een munt betreft XXX-EUR en niet een munt naar munt
    var patt = new RegExp("-EUR");    
    for (let i = 0; i < allCoins.length; i++) {
      var res = patt.test(allCoins[i][0]);
      if ( res === true && allCoins[i][12] > 0 && allCoins[i][0] != besteMuntData[0] && allCoins[i][10] > 0 ) { //Als het een XXX-EUR munt is en als er een RSI is en niet de beste munt.
            if ( allCoins[i][10] > besteMunt2 ) {
              besteMunt2 = allCoins[i][10]
              //allCoins[i][13] = parseFloat(i) // Hier gaat de RATING in de allCoins array
              besteMuntData2 = allCoins[i]
            }
      }      
  }}
  besteMunt3 = -10000;
  besteMuntData3 = [];
  if (besteMunt > -10000 && besteMunt2 > -10000) {
    //We testen hieronder of het een munt betreft XXX-EUR en niet een munt naar munt
    var patt = new RegExp("-EUR");    
    for (let i = 0; i < allCoins.length; i++) {
      var res = patt.test(allCoins[i][0]);
      if ( res === true && allCoins[i][12] > 0 && allCoins[i][0] != besteMuntData[0] && allCoins[i][0] != besteMuntData2[0] && allCoins[i][10] > 0 ) { //Als het een XXX-EUR munt is en als er een RSI is en niet de beste 2 munten.
            if ( allCoins[i][10] > besteMunt3 ) {
              besteMunt3 = allCoins[i][10]
              //allCoins[i][13] = parseFloat(i) // Hier gaat de RATING in de allCoins array
              besteMuntData3 = allCoins[i]
            }
      }      
  }}
  besteMunt4 = -10000;
  besteMuntData4 = [];
  if (besteMunt > -10000 && besteMunt2 > -10000 && besteMunt3 > -10000) {
    //We testen hieronder of het een munt betreft XXX-EUR en niet een munt naar munt
    var patt = new RegExp("-EUR");    
    for (let i = 0; i < allCoins.length; i++) {
      var res = patt.test(allCoins[i][0]);
      if ( res === true && allCoins[i][12] > 0 && allCoins[i][0] != besteMuntData[0] && allCoins[i][0] != besteMuntData2[0] && allCoins[i][0] != besteMuntData3[0] && allCoins[i][10] > 0 ) { //Als het een XXX-EUR munt is en als er een RSI is en niet de beste 3 munten.
            if ( allCoins[i][10] > besteMunt4 ) {
              besteMunt4 = allCoins[i][10]
              //allCoins[i][13] = parseFloat(i) // Hier gaat de RATING in de allCoins array
              besteMuntData4 = allCoins[i]
            }
      }      
  }}
  besteMunt5 = -10000;
  besteMuntData5 = [];
  if (besteMunt > -10000 && besteMunt2 > -10000 && besteMunt3 > -10000 && besteMunt4 > -10000) {
    //We testen hieronder of het een munt betreft XXX-EUR en niet een munt naar munt
    var patt = new RegExp("-EUR");    
    for (let i = 0; i < allCoins.length; i++) {
      var res = patt.test(allCoins[i][0]);
      if ( res === true && allCoins[i][12] > 0 && allCoins[i][0] != besteMuntData[0] && allCoins[i][0] != besteMuntData2[0] && allCoins[i][0] != besteMuntData3[0] && allCoins[i][0] != besteMuntData4[0] && allCoins[i][10] > 0 ) { //Als het een XXX-EUR munt is en als er een RSI is en niet de beste 4 munten.
            if ( allCoins[i][10] > besteMunt5 ) {
              besteMunt5 = allCoins[i][10]
              //allCoins[i][13] = parseFloat(i) // Hier gaat de RATING in de allCoins array
              besteMuntData5 = allCoins[i]
            }
      }      
  }}
  //console.log('BesteMunt  = ' + besteMuntData[0] + ' RSI = ' + besteMuntData[12] + '. RSI low setting = ' + lowRSI + 'Beste munt score = ' + besteMunt)
  //console.log('BesteMunt2 = ' + besteMuntData2[0] + ' RSI = ' + besteMuntData2[12] + '. RSI low setting = ' + lowRSI + 'Beste munt score = ' + besteMunt2)
  //console.log('BesteMunt3 = ' + besteMuntData3[0] + ' RSI = ' + besteMuntData3[12] + '. RSI low setting = ' + lowRSI + 'Beste munt score = ' + besteMunt3)
  //console.log('BesteMunt4 = ' + besteMuntData4[0] + ' RSI = ' + besteMuntData4[12] + '. RSI low setting = ' + lowRSI + 'Beste munt score = ' + besteMunt4)
  //console.log('BesteMunt5 = ' + besteMuntData5[0] + ' RSI = ' + besteMuntData5[12] + '. RSI low setting = ' + lowRSI + 'Beste munt score = ' + besteMunt5)
  if ( besteMuntData[0] != undefined ){
    io.sockets.emit('CoinTracker',besteMuntData[0],besteMuntData2[0],besteMuntData3[0],besteMuntData4[0],besteMuntData5[0],besteMunt,besteMunt2,besteMunt3,besteMunt4,besteMunt5) 
  } 
    
      if ( aankoopArray.length < 1 && besteMuntData[12] < 50 && besteMuntData[12] > 0 && besteMunt > -10000 && besteMuntData[0] != laatsteMunt && besteMunt5 > -10000) { 
        buy(besteMuntData) 
        console.log(' Koop order besteMuntData : ' + besteMuntData)
      }
      if ( aankoopArray.length < 1 && besteMuntData2[12] < 48 && besteMuntData2[12] > 0 && besteMunt2 > -10000 && besteMuntData[0] != laatsteMunt && besteMunt5 > -10000) { 
        buy(besteMuntData2) 
        console.log(' Koop order besteMuntData : ' + besteMuntData2)
      }
      if ( aankoopArray.length < 1 && besteMuntData3[12] < lowRSI && besteMuntData3[12] > 0 && besteMunt3 > -10000 && besteMuntData[0] != laatsteMunt && besteMunt5 > -10000) { 
        buy(besteMuntData3) 
        console.log(' Koop order besteMuntData : ' + besteMuntData3)
      }
      if ( aankoopArray.length < 1 && besteMuntData4[12] < lowRSI && besteMuntData4[12] > 0 && besteMunt4 > -10000 && besteMuntData[0] != laatsteMunt && besteMunt5 > -10000) { 
        buy(besteMuntData4) 
        console.log(' Koop order besteMuntData : ' + besteMuntData4)
      }
      if ( aankoopArray.length < 1 && besteMuntData5[12] < lowRSI && besteMuntData5[12] > 0 && besteMunt5 > -10000 && besteMuntData[0] != laatsteMunt) { 
        buy(besteMuntData5) 
        console.log(' Koop order besteMuntData : ' + besteMuntData5)
      }    
  }
      
}

// Deze tweaken en testen
//
// checkSell() moet de aangekochte munt testen op verkoop 'gewicht'. Hierbij kan gedacht worden aan
// --> Meten of de munt nog steeds goed scoort voor aankoop
// --> De markt toetsen op dalingen
// --> De munt zelf toetsen na winst. Een verkoop bij winst moet wel uit kunnen qua fee's
// --> Testen op resistance, higher highs higher lows, lower highs lower lows.  ---> Te moeilijk...... Nu met RSI. Werkt goed
//
//allCoins.push([entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','smaLong + of -', '24hrsPercentage', 'ScoringsGewicht', '1hrsPercentage'])
//Waarschijnlijk is het beter om op puur arbitrage een verkoop beslissing te maken
//  ??? Keldert de markt hard
//  ??? Zit ik boven mijn winst target of onder mijn verlies target
//  ??? Zijn er andere munten waar ik beter mijn geld in kan stoppen
//  ??? Stijgt de munt uberhaupt wel
//
// Nu werkt de beslissing gedeeltelijk arbitrair en met RSI functionaliteit. Van alles wat dus.


function checkSell() {
  
  for (let i = 0; i < allCoins.length; i++) {
    if ( aankoopArray.length > 0 ) {
    if ( allCoins[i][0] === aankoopArray[0][0] ) {
      if ( allCoins[i][0] === besteMuntData[0] || allCoins[i][0] === besteMuntData2[0] || allCoins[i][0] === besteMuntData3[0] || allCoins[i][0] === besteMuntData4[0] || allCoins[i][0] === besteMuntData5[0]) { return } // Als de aangekochte munt nog steeds in de top 5 staat doe dan niks
      
      
      //Scorings systeem verkoop
      //var scoreShortSterkte = allCoins[i][6] * 1 // De sterkte van de short trend boven de lange trend SMA ( stijgt de munt sterk? )
      //var scoreMediumSterkte = allCoins[i][7] * 1 // De sterkte van de medium trend boven de lange trend SMA ( stijgt de munt sterk? )
      var scoreLongTrendPercent = allCoins[i][8] * verkoopFactor1 // De sterkte van de lange trend SMA
      var scoreWholeMarket2min = wholeMarketTrend2min * verkoopFactor2 // De sterkte van de korte hele markt trend.
      //var vorigePrijs = allCoins[i][1][allCoins[i][1].length-smaLongPeriod]
      var aankoopPrijs = aankoopArray[0][1]
      var laatstePrijs = parseFloat(allCoins[i][3]) //parseFloat(allCoins[i][1][allCoins[i][1].length-1])
      let targetPrijs = parseFloat(aankoopArray[0][4])
      var scrorePrijsPercentage = ((laatstePrijs - targetPrijs) / targetPrijs) * 100  // Score op basis van prijs verandering tov verkoop targetprijs
      var scroreAankoopPrijsPercentage = ((laatstePrijs - aankoopPrijs) / aankoopPrijs) * 100 * verkoopFactor3 // Score op basis van prijs verandering
      // We pakken het percentuele verschil tussen aankoop prijs en huidige prijs ( vorigePrijs en laatstePrijs )
      var verkoopScore = scoreLongTrendPercent + scoreWholeMarket2min + scroreAankoopPrijsPercentage
      var verkoopScore2 = scoreLongTrendPercent //allCoins[i][11] + allCoins[i][14] + allCoins[i][15] // Verkoop score is 1 uurs perc + 30min perc + 10 min perc
      aankoopArray[0][3] = parseFloat(verkoopScore2)
      if ( scrorePrijsPercentage > L1 ) { aankoopArray[0][4] = laatstePrijs } // Als de munt x% gestegen is zet de targetPrijs op laatste prijs
      //console.log( verkoopScore )
      console.log( 'aankoop naam= ' + aankoopArray[0][0] + '. Verkoop score = ' + verkoopScore + '. RSI = ' + allCoins[i][12] + '. scoreAankoopPrijsPercentage = ' + scroreAankoopPrijsPercentage)
      console.log( 'Prijs stijging = ' + scrorePrijsPercentage + ' %. Stijging long trend = ' + allCoins[i][8])
      //console.log(laatstePrijs + '-' + targetPrijs + '/' + targetPrijs + ' = ' + scrorePrijsPercentage )
      //console.log(aankoopArray)
      //We verkopen als de markt crashed...
      if ( aankoopArray.length > 0 && (scoreWholeMarket2min/verkoopFactor2) < L2 ) { 
        io.sockets.emit('Sell', ' De markt zakte in elkaar... Euros veilig gesteld!', (scoreWholeMarket2min/verkoopFactor2))
        var d = new Date()
        berichten.push([d.toLocaleString() + ' De markt zakte in elkaar... Euros veilig gesteld!' + (scoreWholeMarket2min/verkoopFactor2)])
        sell(aankoopArray[0],allCoins[i])
         
      }
      //We verkopen als de munt goed gestegen is en de lange trend naar beneden zakt op een hoog moment
      //Hier kunnen we een MOVING target van maken. BV.. Als de prijs nog stijgt stellen we de winst % hoger bij.
      //  Dan blijft de munt langer door stijgen en word deze niet vroegtijdig verkocht.
      //Hier kan ook nog een check op komen of er toevallig niet een veel beter munt is om in te investeren..
      //if ( aankoopArray.length > 0 && (scroreAankoopPrijsPercentage/verkoopFactor3) > 2 && (scoreLongTrendPercent/verkoopFactor1) <= 0 && allCoins[i][12] > 50 && allCoins[i][12] < 100) {
      //  io.sockets.emit('Sell', 'Sold due to making good revenue but long trend is diving.', (scoreLongTrendPercent/verkoopFactor1))
      //  var d = new Date()
      //  berichten.push([d.toLocaleString() + 'Sold due to making good revenue but long trend is diving.' + (scoreLongTrendPercent/verkoopFactor1)])  
      //  sell(aankoopArray[0],allCoins[i])
      //  
      //}
      //We verkopen als de prijs > x% zakt onder de target prijs (Die meeloopt als de munt stijgt) erg laag is en het lang gemiddelde zakt
      //VANAF HIER VERDER WERKEN MET DE SETTINGS INTERFACE FRONT END
      //Test met shortAVG ipv prijs.. De prijs springt soms te ver op en neer waardoor deze de trigger afzet.
      if ( aankoopArray.length > 0 && scrorePrijsPercentage < L3  ) { // && allCoins[i][8] < 0 <---Bugje
        io.sockets.emit('Sell', ' De munt zakte onder de verkoop % limiet. Heb hem verkocht.', scrorePrijsPercentage)
        var d = new Date()
        berichten.push([d.toLocaleString() + ' De munt zakte onder de verkoop % limiet. Heb hem verkocht.' + scrorePrijsPercentage]) 
        sell(aankoopArray[0],allCoins[i])
         
      }
      //Verkoop als de munt gewoon niet goed is (1 uurs % + 30min % + 10 min % is < 0) na 3 uur meten
      if ( aankoopArray.length > 0 && verkoopScore2 < 0  && aankoopTimer > 180 ) {
        io.sockets.emit('Sell', ' Deze munt is niet zo best. Ik koop een betere en heb hem verkocht.', verkoopScore2)
        var d = new Date()
        berichten.push([d.toLocaleString() + ' Deze munt is niet zo best. Ik koop een betere en heb hem verkocht.' + verkoopScore2]) 
        sell(aankoopArray[0],allCoins[i])
         
      }
      io.sockets.emit('limits', targetPrijs )
      //We verkopen als het een totale mislukking is
      //Te ver zakt en de trend omlaag is
      //----- EXPERIMENTEEL ----
      //if ( aankoopArray.length > 0 && (scroreAankoopPrijsPercentage/verkoopFactor3) < -2 && (scoreLongTrendPercent/verkoopFactor1) < 0 && allCoins[i][12] > 50 && allCoins[i][12] < 100) {
      //  io.sockets.emit('Sell', 'The coin was a failure. Sold it.', (scoreLongTrendPercent/verkoopFactor1))
      //  var d = new Date()
      //  berichten.push([d.toLocaleString() + 'The coin was a failure. Sold it.' + (scoreLongTrendPercent/verkoopFactor1)]) 
      //  sell(aankoopArray[0],allCoins[i])
      //   
      //}
    }
  }
}

}

function buy(coindata) {
  console.log('Ik probeer ' + coindata[0] + ' te kopen met prijs ' + coindata[1])
  try {
  aankoopTimer = 0  
  var prices = coindata[1]
  var price = parseFloat(prices[prices.length-1])
  var name = coindata[0]
  geldEUR = geldEUR / feeFactor  
  var aankoophoeveelheid = geldEUR / price
  geldEUR = geldEUR - (aankoophoeveelheid * price)
  aankoopArray.push([name,price,parseFloat(aankoophoeveelheid),'verkoopScore',price])
  console.log('Ingekocht munt ' + name + ' hoeveelheid = ' + aankoophoeveelheid + ' voor prijs: ' + price +'. En SCORE = ' + coindata[10] + '. En RSI = ' + coindata[12] )
  console.log('Saldo Euro = ' + geldEUR)
  console.log(aankoopArray)
  checkDelayTimer = 0;
  io.sockets.emit('Buy', ' Ik heb ' + aankoopArray[0][0] + ' ingekocht met prijs ' + aankoopArray[0][1].toFixed(3) + ' en hoeveelheid ' + aankoopArray[0][2].toFixed(3) + '.')
  var d = new Date()
  berichten.push([d.toLocaleString() + ' Ik heb ' + aankoopArray[0][0] + ' ingekocht met prijs ' + aankoopArray[0][1].toFixed(3) + ' en hoeveelheid ' + aankoopArray[0][2].toFixed(3)  + '.'])
  laatsteMunt = name  
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
  console.log('Munt verkocht: ' + aankoopdata[0] + ' Koop = ' + buyPrice + ' Verkoop = ' + sellPrice)
  console.log('Saldo Euros = ' + geldEUR)
  console.log(aankoopArray)
  checkDelayTimer = 0;
}

io.on('connection', socket => {
  
    socket.emit('user-connected', berichten)

    socket.on('disconnect', () => {
        socket.emit('user-disconnected')
    })
        socket.on('sellCoin', () => {
          console.log('Nood Stop ingedrukt!!!!!!!!!!!!!!!!!!!!!')
          for (let i = 0; i < allCoins.length; i++) {
            if ( aankoopArray.length > 0 ) {
            if ( allCoins[i][0] === aankoopArray[0][0] ) {
              sell(aankoopArray[0],allCoins[i])
              //Ik gebruik de Buy versie omdat ik dan alleen text kan verzenden.
              io.sockets.emit('Buy', ' Munt verkocht want er is op de VERKOOP DEZE MUNT knop gedrukt.')
              var d = new Date()
              berichten.push([d.toLocaleString() + ' Munt verkocht want er is op de VERKOOP DEZE MUNT knop gedrukt.'])
              
            }
          }
        }
    
    })
    socket.on('settings', () => {
      socket.emit('serverSettings', smaShortPeriod, smaMediumPeriod, smaLongPeriod, score24hrsTrendFactor, score1hrsTrendFactor, scoreLongTrendFactor, scoreWholeMarketFactor, lowRSI, marktkooppercentage, L1, L2, L3, score6hrsTrendFactor, score30minTrendFactor, score10minTrendFactor)
  })
  //let score6hrsTrendFactor = 10
  //let score30minTrendFactor = 10
  //let score10minTrendFactor = 10
  socket.on('newSettings', (SsmaShort, SsmaMedium, SsmaLong, Sscore24hrsTrendFactor, Sscore1hrsTrendFactor, SscoreLongTrendFactor, SscoreWholeMarketFactor, SlowRSI, Smarktkooppercentage, SL1, SL2, SL3, Sscore6hrsTrendFactor, Sscore30minTrendFactor, Sscore10minTrendFactor) => {
    smaShortPeriod = parseFloat(SsmaShort);
    smaMediumPeriod = parseFloat(SsmaMedium);
    smaLongPeriod = parseFloat(SsmaLong); 
    score24hrsTrendFactor = parseFloat(Sscore24hrsTrendFactor)
    score1hrsTrendFactor = parseFloat(Sscore1hrsTrendFactor)
    scoreLongTrendFactor = parseFloat(SscoreLongTrendFactor)
    scoreWholeMarketFactor = parseFloat(SscoreWholeMarketFactor)
    lowRSI = parseFloat(SlowRSI);
    //verkoopFactor1 = parseFloat(SverkoopFactor1) // factor scoreLongTrendPercent
    //verkoopFactor2 = parseFloat(SverkoopFactor2) // factor scoreWholeMarket2min
    //verkoopFactor3 = parseFloat(SverkoopFactor3) // factor scoreAankoopPrijsPercentage
    marktkooppercentage = parseFloat(Smarktkooppercentage)
    L1 = parseFloat(SL1)
    L2 = parseFloat(SL2)
    L3 = parseFloat(SL3)
    score6hrsTrendFactor = parseFloat(Sscore6hrsTrendFactor)
    score30minTrendFactor = parseFloat(Sscore30minTrendFactor)
    score10minTrendFactor = parseFloat(Sscore10minTrendFactor)
    console.log('Nieuwe instellingen ontvangen van de front end = ' + smaShortPeriod)
})     
})




server.listen(3010, '0.0.0.0')