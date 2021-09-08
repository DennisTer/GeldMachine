// TO DO
// Zorgen dat de arrays niet eindeloos groot worden!!!! Hoe groot moeten ze worden?
// Hoe synchroniseer je arrays met verschillende grootes met de tijd voor weergave 
// in een grafiek?
// Hoe sturen we de hele handel naar de frontend? Via GET of via sockets?

// De array allCoins bevat ALLE info van elke coin. Naam, Price, date, short SMA, Medium sma, Long sma, Sterkte
// Sterkte = short ten opzichte van long sma in %. Dit is een koop of verkoop trigger....

// Als fail safe bewaren voor welke prijs je een munt hebt ingekocht......

// Bij aankoop en verkoop de decimalen van de munt achterhalen!!!



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
let limitRemaining;
//const coins = ['HOT','BTC','ELF'];
let timeStamps = [];
let smaShortPeriod = 20;
let smaMediumPeriod = 50;
let smaLongPeriod = 200;
let allCoins = []; //Multi dimensional array of all coins and prices and trends.. Gonna be HUGE!!
let buildALLCOINS = 0;
let buytimer = 0;
let coinHero;
let coinHero2;
let coinHeroName;
let bestCoins = [];

//Virtuele coin om te testen...
let geldEUR = 1000;
let feeFactor = 1.002;
let aankoopArray = [];
let digiEUR = 0;
let huidigePrijsAangekocht = 0;
let muntLong = 0;
let muntMedium = 0;
let muntShort = 0;

//Setting the format for the Simple Moving Averager
var format = function(n) {
  return n.toFixed(8);
};

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})



function intervalFunc() {  
  // options: market
  bitvavo.websocket.tickerPrice({})  
}

setInterval(intervalFunc,5000);


// Aan de hand van korte en lang lopende gemiddelden kan de trend worden bepaald. Als het kort lopende
// gemiddelde hoger is als het lang lopende gemiddelde dan stijgt de prijs and vica versa.
// Het lang lopende gemiddelde is een indicatie van wat de markt doet... Stijgen of dalen.
// Het kan gebruikt worden als entry of exit strategie. Hier zullen wel nog meer indicatoren bij moeten komen.
bitvavo.getEmitter().on('tickerPrice', (response) => {
  for (let entry of response) {
    
    //HIERONDER HET BOUWEN VAN EEN ARRAY OBJECT MET ALLE COINS EN PRIJZEN
    //buildALLCOINS is een opstart meganisme om de array op te bouwen from scratch
    //Nieuwe munten worden alleen toegevoegd na opnieuw opstarten server!!!!!!

    if (buildALLCOINS === 0)
    { 
      allCoins.push([entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','TrendLongPLUS of MIN']);
    } else {
      for (let i = 0; i < allCoins.length; i++) {
        if (allCoins[i][0] === entry.market) { 
          allCoins[i][1].push(parseFloat(entry.price))
          allCoins[i][2].push(Date.now())
          if (allCoins[i][1].lenght > 1000) { allCoins[i][1].shift() }
          if (allCoins[i][2].lenght > 1000) { allCoins[i][2].shift() }
        };
        
      }
       
    }
    
  }
  // 2 variabellen om de sterkste munt uit allCoins array te kiezen
  coinHero = -100000000;
  coinHero2= -100000000;
  coinHeroName = '';
  bestCoins = []
  //******
  // Hieronder stoppen we de SMA's in de allCoins array
  // Alsmede de stijging adhv de lopende gemiddeldes SMA's
  for (let i = 0; i < allCoins.length; i++) {
    var avgShort = sma(allCoins[i][1],smaShortPeriod,format);
    var avgMedium = sma(allCoins[i][1],smaMediumPeriod,format);
    var avgLong = sma(allCoins[i][1],smaLongPeriod,format);
    for (let i = 1; i < smaShortPeriod; i++) {
      avgShort.unshift(allCoins[i][1][allCoins[i][1].lenght-1]);
    }
    for (let i = 1; i < smaMediumPeriod; i++) {
      avgMedium.unshift(allCoins[i][1][allCoins[i][1].lenght-1]);
    }
    for (let i = 1; i < smaLongPeriod; i++) {
      avgLong.unshift(allCoins[i][1][allCoins[i][1].lenght-1]);
    }
    if (avgShort.length > 0) {allCoins[i][3] = parseFloat(avgShort[avgShort.length-1])};
    if (avgMedium.length > 0) {allCoins[i][4] = parseFloat(avgMedium[avgMedium.length-1])};
    if (avgLong.length > 0) {allCoins[i][5] = parseFloat(avgLong[avgLong.length-1])};
    if (avgLong.length > 1) {allCoins[i][8] = parseFloat(avgLong[avgLong.length-2])};
    var stijging = ((allCoins[i][3]-allCoins[i][5])/allCoins[i][5]) * 100;
    var stijgingmedium = ((allCoins[i][4]-allCoins[i][5])/allCoins[i][5]) * 100;
    var stijgingLong = allCoins[i][5] - allCoins[i][8];    
    if ( stijging != NaN) { allCoins[i][6] = parseFloat(stijging.toFixed(4)) }
    if ( stijgingmedium != NaN) { allCoins[i][7] = parseFloat(stijgingmedium.toFixed(4)) }
    if ( stijgingLong != undefined) { allCoins[i][8] = parseFloat(stijgingLong.toFixed(4) * 1000) }
    if ( aankoopArray.length != 0 ){
      
      if ( allCoins[i][0] === aankoopArray[0][0]) {
        var price = allCoins[i][1][allCoins[i][1].length-1]
        huidigePrijsAangekocht = parseFloat(price)
        digiEUR = parseFloat(aankoopArray[0][2])*parseFloat(price)
        muntLong = allCoins[i][8]
        muntMedium = allCoins[i][7]
        muntShort = allCoins[i][6]
        io.sockets.emit('BuyStatus', aankoopArray, digiEUR, allCoins[i][1] ,avgShort, avgMedium, avgLong, allCoins[i][2])
        //console.log('Fired!!!!   ' + huidigePrijsAangekocht + '   ' + digiEUR) 
        
      }
    }
    
    //CoinHero
    //
    //CoinHero is een meganisme om een geschikte coin te vinden om te kopen. In de loop word elke coin geupdate.
    //CoinHero filert de munten eruit die aan bepaalde voorwaarden voldoen.
    // 1 - De SMA's kort en medium moeten hoger liggen dan de Long trend
    //      Dit geeft aan dat de munt aan het stijgen is en de prijs boven het lang gemiddelde is
    // 2 - De Long trend moet een opgaande trend zijn van een geschikte sterkte
    //      allCoins[i][8] is de sterkte van de Long trend * 1000 wat niks is als een check of de Long trend omhoog gaat.
    // 3 - De huidige prijs moet hoger liggen als de laatste waarde van de Long trend
    //De beste coinHero word gebruikt al aankoop munt.
    //   && allCoins[i][5] <= allCoins[i][1]
    var lp =  allCoins[i][1][allCoins[i][1].length-1]
    //  console.log(allCoins[i][5] + '<-- Last avgLong, last price --->' + parseFloat(lp))
    //  De checkstatusSELL isa nu wel aardig... Daar moet aankoop ook op gebaseerd zijn!!!!!!!!
    //
    // Verbouwing coinHero.....
    // bestCoins word een array van long term stijgende coins waaruit later gefilterd word
    if ( allCoins[i][8] > 5 ) {      
      bestCoins.push(allCoins[i]) // Een array met alle stijgende munten
      //Nu gaan we na de loop de coin zoeken die het diepst onder de trend zit      
    }
    //*******   
  }
  //Hier filteren we bestCoins array om de munt te zoeken die het diepst onder de Long trend zit
  //
  var deltaMax = 0
  for (let i = 0; i < bestCoins.length; i++) {
    var lastprice = bestCoins[i][1][bestCoins[i][1].length-1] // allCoins[i][1][allCoins[i][1].length-1]
    var lastAVG = bestCoins[i][5]
    var deltaMedium = lastprice - lastAVG
    //Als de beste munt steed opnieuw goed scoort hou dan de timer hoog om verkoop tegen te gaan
    if ( bestCoins[i][0] === aankoopArray[0] && buytimer < 500 ) { buytimer + 25}
    
    if ( deltaMedium < deltaMax && deltaMedium < 0) {
      coinHeroArr = bestCoins[i]
      coinHeroName = bestCoins[i][0]
      deltaMax = deltaMedium
      console.log( 'coinHero=' + coinHeroName + '. lastprice=' + lastprice + '.lastAVG=' + lastAVG + '.DeltaMedium= ' + deltaMedium)
    } 
  }
  //console.log(coinHeroName + ' Delta Max= ' + deltaMax)
  //De munt gefilterd is een munt die stijgt en momenteel het verst onder het gemiddelde ligt.

  //coinHero = bestCoins[i][0];
  //coinHero2 = stijgingmedium;
  //coinHeroArr = allCoins[i];
  //coinHeroName = bestCoins[i][0];
  //console.log('CoinHero = ' + coinHeroName + '. Met stijging: ' + coinHero)
  //var lp =  allCoins[i][1][allCoins[i][1].length-1]
  //console.log(allCoins[i][5] + '<-- Last avgLong, last price --->' + parseFloat(lp))


  if (aankoopArray.length > 0) {
    console.log('Gekochte munt: ' + aankoopArray[0][0] + '. Ingekocht voor: ' + aankoopArray[0][1] + '. Hoeveelheid= ' + aankoopArray[0][2])
    console.log('Delta Short SMA: ' + muntShort + '. Delta Medium SMA: ' + muntMedium + '. Long Trend= ' + muntLong)
    var resultaat = (huidigePrijsAangekocht*aankoopArray[0][2])-(aankoopArray[0][1]*aankoopArray[0][2])
    console.log('Huidige prijs= ' + huidigePrijsAangekocht + '. Resultaat= ' + resultaat.toFixed(2) + '. TOTAAL = ' + digiEUR.toFixed(2) + ' EURO')

  }
  //Hieronder halen we de tijd binnen van de bitvavo server. Maar omdat die in Frankfurt staat
  //kun je net zo goed de servertijd nemen met Date.now(). Oftewel lokale computer tijd.
  //We halen ook de API call limiet binnen met limitRemaining = bitvavo.getRemainingLimit().
  bitvavo.time((error, response) => {
    if (error === null) {
      timeStamps.push(response.time)
      
      buildALLCOINS += 1;
      buytimer -= 1;
      
      limitRemaining = bitvavo.getRemainingLimit()
    } else {
      console.log('Handle the error here', error)
    }
    
  })
  //Virtueel handelssysteem om te testen
  checkStatus();
  checkStatusSell();
  io.sockets.emit('Status', buildALLCOINS, coinHeroName)
  
})
//Virtueel handelssysteem om te testen en te tweaken checkStatus, buy and sell
function checkStatus() {
  if (buildALLCOINS > smaLongPeriod) {
    if (geldEUR > 10) {
      for (let i = 0; i < allCoins.length; i++) {
        //Welke munt geschikt is te kopen word bij coinHero en bestCoin bepaald
        if (allCoins[i][0] === coinHeroName) { buy(allCoins[i]) }
        buytimer = 75        
      }
    }    
  }
  
}
// Deze tweaken en testen
// Verkoop moet op basis van het volgende :
//   1 - Als de huidige prijs onder de laatste waarde van SMA long gemiddelde zakt
//   2 - Als de SMA short en SMA medium negatief is
//
// allCoins array = [entry.market, [parseFloat(entry.price)],[Date.now()],'short','medium','long','SterkteShort','Sterktemedium','TrendLongPLUS of MIN']
function checkStatusSell() {
  if (aankoopArray.length >= 0 && buytimer <= 0) {
    for (let i = 0; i < allCoins.length; i++) {
      var lp =  allCoins[i][1][allCoins[i][1].length-1]
        for (let o = 0; o < aankoopArray.length; o++) {
          if (aankoopArray[o][0] === allCoins[i][0] && allCoins[i][3] <= allCoins[i][4] && lp < allCoins[i][4])  {
            sell(aankoopArray[o],allCoins[i])
          } 
        }
      }
    }

}


function buy(coindata) {
  var prices = coindata[1]
  var price = parseFloat(prices[prices.length-1])
  var name = coindata[0]
  geldEUR = geldEUR / feeFactor  
  var aankoophoeveelheid = geldEUR / price
  geldEUR = geldEUR - (aankoophoeveelheid * price)
  aankoopArray.push([name,price,parseFloat(aankoophoeveelheid)])
  console.log('Ingekocht munt ' + name + ' hoeveelheid = ' + aankoophoeveelheid + ' voor prijs: ' + price +'.')
  console.log('Saldo Euro = ' + geldEUR)
  console.log(aankoopArray)
}

function sell(aankoopdata,verkoopdata) {
  var buyPrice = aankoopdata[1]
  var sellPrices = verkoopdata[1]
  var sellPrice = sellPrices[sellPrices.length-1]
  var geld = sellPrice * aankoopdata[2]
  var geldFee = geld / feeFactor
  geldEUR += geldFee
  //let index = aankoopArray.indexOf(aankoopdata)
  //aankoopArray.slice(index,1)
  aankoopArray = []
  
  console.log('Munt verkocht: ' + aankoopdata[0] + ' Buy= ' + buyPrice + ' Sell= ' + sellPrice)
  console.log('Saldo Euros = ' + geldEUR)
  console.log(aankoopArray)
  

}

io.on('connection', socket => {
  
    socket.emit('user-connected')

    socket.on('disconnect', () => {
        socket.emit('user-connected')
    
    })    
})



server.listen(3000, '0.0.0.0')