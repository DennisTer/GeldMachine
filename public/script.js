const socket = io('/')


let labels = ['Now','Then']
let prices = [1,2];
let shortSMA = [1,1];
let mediumSMA = [3,2];
let longSMA = [2,1];
let digitaleEuro;
let lastEUROS;
var ctx = document.getElementById('myChart').getContext('2d');
var ctx_2 = document.getElementById('myChartMarket').getContext('2d');
var myChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: labels,
        datasets: [{
            label: 'Prijs',
            data: prices,
            backgroundColor: 'black',
            borderColor: 'black',
            lineTension: 0.5           
        },
        {
            label: 'Short SMA',
            data: shortSMA,
            backgroundColor: 'green',
            borderColor: 'green',
            lineTension: 0.5               
        },
        {
            label: 'Medium SMA',
            data: mediumSMA,
            backgroundColor: 'blue',
            borderColor: 'blue',
            lineTension: 0.5              
        },
        {
            label: 'Long SMA',
            data: longSMA,
            backgroundColor: 'red',
            borderColor: 'red',
            lineTension: 0.5             
        },
    ],
      
    },
    options: {
        scales: {
            y: {
                beginAtZero: false
            }
        }
    }
});
var myChartMarket = new Chart(ctx_2, {
    type: 'line',
    data: {
        labels: labels,
        datasets: [{
            label: 'Som van alle prijzen',
            data: prices,
            backgroundColor: 'black',
            borderColor: 'black',
            lineTension: 0.5           
        }
    ],
      
    },
    options: {
        scales: {            
            y: {
                beginAtZero: false
            }
        }
    }
});
//Variabellen die gesynchroniseerd worden met de server via settings. Allen starten met een S
let SsmaShortPeriod;
let SsmaMediumPeriod;
let SsmaLongPeriod;
let Sscore24hrsTrendFactor;
let Sscore1hrsTrendFactor;
let SscoreLongTrendFactor;
let SscoreWholeMarketFactor;
let SlowRSI;
let SverkoopFactor1// factor scoreLongTrendPercent
let SverkoopFactor2// factor scoreWholeMarket2min
let SverkoopFactor3// factor scoreAankoopPrijsPercentage
let Smarktkooppercentage // percentage waar boven er gekocht mag worden
let SL1
let SL2
let SL3

socket.on('user-connected', function(berichten) {
    console.log('We Have a COnneectionnnnn!!!!')
    if (berichten.length > 0) {
    for (let i = 0; i < berichten.length; i++) {
        var consoleDiv = document.getElementById('consoleDiv')
        var a = document.createElement("p");
        var newtext = berichten[i][0];
        a.innerHTML = newtext
        consoleDiv.appendChild(a);
    }
    } else { console.log('No cached server messages') }
    
});

socket.on('Status', function(counter, coinHeroName) {
    console.log('Loop count = ' + counter + '. coinHero = ' + coinHeroName)
});

socket.on('Test', function() {
    console.log('Recieved TEST from server')
});

socket.on('BuyStatus', function(aankoopArray, digiEUR, pricess , sSMA, mSMA, lSMA, lab, score, hr1percentage, hr24percentage, RSI) {
    console.log('BUY Status recieved, updating the chart')
    var coin = document.getElementById('trackCoin')
    coin.innerText = aankoopArray[0][0] + '. Totaal Euros = ' + digiEUR.toFixed(2) + '. En Score = ' + score.toFixed(2)
    var coin2 = document.getElementById('trackCoin2')
    coin2.innerText = '24 Hrs trend = ' + hr24percentage.toFixed(2) + '%. 1 Hr trend = ' + hr1percentage.toFixed(2) + '%. En RSI = ' + RSI
    

    //console.log(pricess)
    //console.log(sSMA)
    let sSMAfloats = []
    let mSMAfloats = []
    let lSMAfloats = []

    let labels = []
    for (let i = 0; i < lab.length; i++) {
        var d = new Date(lab[i])
        labels.push(d.toLocaleString());
      }

    for (let i = 0; i < sSMA.length; i++) {
        sSMAfloats.push(parseFloat(sSMA[i]));
      }
    for (let i = 0; i < mSMA.length; i++) {
        mSMAfloats.push(parseFloat(mSMA[i]));
      }
    for (let i = 0; i < lSMA.length; i++) {
        lSMAfloats.push(parseFloat(lSMA[i]));
      }

    myChart.data.labels = labels;
    myChart.data.datasets[0].data = pricess;
    
    myChart.data.datasets[1].data = sSMAfloats;
    myChart.data.datasets[2].data = mSMAfloats;
    myChart.data.datasets[3].data = lSMAfloats;
    myChart.update();
    //play()
    //console.log( pricess.length + ' ' + sSMAfloats.length + ' ' + mSMAfloats.length + ' ' + lSMAfloats.length )
    //console.log(lab)

    digitaleEuro = digiEUR
    if ( digitaleEuro > lastEUROS) { play() }
    lastEUROS = digitaleEuro
    
});

socket.on('MarketStatus', function(MarketSumArray, MarketSumArrayTimes, wholeMarketTrend) {
    if (wholeMarketTrend){
    console.log('MARKET Status recieved, updating the whole market chart')
    var marketpercent = document.getElementById('wholeMarket')
    marketpercent.innerText = 'Trend van de hele markt = ' + wholeMarketTrend.toFixed(2) + ' %'

    let labels = []
    for (let i = 0; i < MarketSumArrayTimes.length; i++) {
        var d = new Date(MarketSumArrayTimes[i])
        labels.push(d.toLocaleString());
      }
    
    myChartMarket.data.labels = labels;
    myChartMarket.data.datasets[0].data = MarketSumArray;
    myChartMarket.update();
    }
    //console.log(MarketSumArrayTimes)
});

socket.on('Sell', function(text, reason) {
    
    var consoleDiv = document.getElementById('consoleDiv')
    var a = document.createElement("p");
    var d = new Date()
    var newtext = d.toLocaleString() + ' : ' + text + ' with reason ' + reason.toFixed(2);
    a.innerHTML = newtext
    consoleDiv.appendChild(a);
});

socket.on('Buy', function(text) {
    
    var consoleDiv = document.getElementById('consoleDiv')
    var a = document.createElement("p");
    var d = new Date()
    var newtext = d.toLocaleString() + ' : ' + text;
    a.innerHTML = newtext
    consoleDiv.appendChild(a);
});

socket.on('CoinTracker', function(besteMuntData,besteMuntData2,besteMuntData3,besteMuntData4,besteMuntData5,besteMunt,besteMunt2,besteMunt3,besteMunt4,besteMunt5) {
    
    var ctp = document.getElementById('besteMunt')
    var ctp2 = document.getElementById('besteMunt2')
    var ctp3 = document.getElementById('besteMunt3')
    var ctp4 = document.getElementById('besteMunt4')
    var ctp5 = document.getElementById('besteMunt5')    
    ctp.innerHTML = '#1 Coin = ' + besteMuntData + ' met score van ' + besteMunt
    ctp2.innerHTML = '#2 Coin = ' + besteMuntData2 + ' met score van ' + besteMunt2
    ctp3.innerHTML = '#3 Coin = ' + besteMuntData3 + ' met score van ' + besteMunt3
    ctp4.innerHTML = '#4 Coin = ' + besteMuntData4 + ' met score van ' + besteMunt4
    ctp5.innerHTML = '#5 Coin = ' + besteMuntData5 + ' met score van ' + besteMunt5
});

socket.on('serverSettings', function(smaShort, smaMedium, smaLong, score24hrsTrendFactor, score1hrsTrendFactor, scoreLongTrendFactor, scoreWholeMarketFactor, lowRSI, verkoopFactor1, verkoopFactor2, verkoopFactor3, marktkooppercentage, L1, L2, L3) {
    SsmaShortPeriod = smaShort
    SsmaMediumPeriod = smaMedium
    SsmaLongPeriod = smaLong
    Sscore24hrsTrendFactor = score24hrsTrendFactor
    Sscore1hrsTrendFactor = score1hrsTrendFactor 
    SscoreLongTrendFactor = scoreLongTrendFactor
    SscoreWholeMarketFactor = scoreWholeMarketFactor
    SlowRSI = lowRSI
    SverkoopFactor1 = verkoopFactor1 // factor scoreLongTrendPercent
    SverkoopFactor2 = verkoopFactor2 // factor scoreWholeMarket2min
    SverkoopFactor3 = verkoopFactor3 // factor scoreAankoopPrijsPercentage
    Smarktkooppercentage = marktkooppercentage
    SL1 = L1
    SL2 = L2
    SL3 = L3
    $("#interface").load("settings.html",function(){
        document.getElementById("vol1").value = SsmaShortPeriod;
        document.getElementById("vol2").value = SsmaMediumPeriod;
        document.getElementById("vol3").value = SsmaLongPeriod;
        document.getElementById("aankoop1").value = Sscore24hrsTrendFactor;
        document.getElementById("aankoop2").value = Sscore1hrsTrendFactor;
        document.getElementById("aankoop3").value = SscoreLongTrendFactor;
        document.getElementById("aankoop4").value = SscoreWholeMarketFactor;
        document.getElementById("RSIaankoop").value = SlowRSI;
        document.getElementById("verkoopScore1").value = SverkoopFactor1;
        document.getElementById("verkoopScore2").value = SverkoopFactor2;
        document.getElementById("verkoopScore3").value = SverkoopFactor3;
        document.getElementById("marktkooppercentage").value = Smarktkooppercentage;
        document.getElementById("L1").value = SL1
        document.getElementById("L2").value = SL2
        document.getElementById("L3").value = SL3
    });
    
    //console.log(SsmaShortPeriod + '  ' + SsmaMediumPeriod + '  ' + SsmaLongPeriod)
});
function play() {
    var audio = document.getElementById("audio");
    audio.play();
  }

  function sellCoin() {
      socket.emit('sellCoin')
  }

  /* Set the width of the side navigation to 250px and the left margin of the page content to 250px */
function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
    document.getElementById("main").style.marginLeft = "250px";
  }
  
  /* Set the width of the side navigation to 0 and the left margin of the page content to 0 */
  function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
    document.getElementById("main").style.marginLeft = "0";
  }

  function info() {
                $("#interface").load("info.html");    
  }

  function settings() {
    socket.emit('settings')
    
  }

  function clearInterface() {
    var interface = document.getElementById('interface')
    interface.innerHTML = ''
  }  

  function sendSettings(id,value) {
    SsmaShortPeriod = document.getElementById("vol1").value;
    SsmaMediumPeriod = document.getElementById("vol2").value;
    SsmaLongPeriod = document.getElementById("vol3").value;
    Sscore24hrsTrendFactor = document.getElementById("aankoop1").value;
    Sscore1hrsTrendFactor = document.getElementById("aankoop2").value;
    SscoreLongTrendFactor = document.getElementById("aankoop3").value;
    SscoreWholeMarketFactor = document.getElementById("aankoop4").value;
    SlowRSI = document.getElementById("RSIaankoop").value;
    SverkoopFactor1 = document.getElementById("verkoopScore1").value;
    SverkoopFactor2 = document.getElementById("verkoopScore2").value;
    SverkoopFactor3 = document.getElementById("verkoopScore3").value;
    Smarktkooppercentage = document.getElementById("marktkooppercentage").value;
    SL1 = document.getElementById("L1").value;
    SL2 = document.getElementById("L2").value;
    SL3 = document.getElementById("L3").value;
    socket.emit('newSettings', SsmaShortPeriod, SsmaMediumPeriod, SsmaLongPeriod, Sscore24hrsTrendFactor, Sscore1hrsTrendFactor, SscoreLongTrendFactor, SscoreWholeMarketFactor, SlowRSI, SverkoopFactor1, SverkoopFactor2, SverkoopFactor3, Smarktkooppercentage)
    console.log('New Settings Send to server')
  }