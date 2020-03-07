const { time } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const zUniPool = artifacts.require("zUniPool");

async function timeIncreaseTo(seconds) {
  const delay = 1000 - new Date().getMilliseconds();
  await new Promise(resolve => setTimeout(resolve, delay));
  await time.increaseTo(seconds);
}

//DeFiZap Unipool General
const unipoolGeneralAbi = require("./abis/unipoolGeneralABI.json");
const unipoolGeneralAddress = "0x97402249515994Cc0D22092D3375033Ad0ea438A";
const unipoolGeneralContract = new web3.eth.Contract(
  unipoolGeneralAbi,
  unipoolGeneralAddress
);

//Uniswap Exchange
const uniswapExchangeAbi = require("./abis/uniswapExchangeABI.json");
const uniswapExchangeAddress = "0xe9Cf7887b93150D4F2Da7dFc6D502B216438F244"; //sETH LP Token Exchange
const uniswapExchangeContract = new web3.eth.Contract(
  uniswapExchangeAbi,
  uniswapExchangeAddress
);

//Synthetix Unipool
const unipoolAbi = require("../build/contracts/Unipool.json").abi;
const unipoolAddress = "0x48D7f315feDcaD332F68aafa017c7C158BC54760";
const unipoolContract = new web3.eth.Contract(unipoolAbi, unipoolAddress);

//SNX Unipool
const erc20Abi = require("../build/contracts/IERC20.json").abi;
const snxAddress = "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F";
const snxContract = new web3.eth.Contract(erc20Abi, snxAddress);

//Constants
const approval = "9999999999000000000000000000";
const gas2Use = "1000000";
const oneSethLP = "1000000000000000000";
const oneEth = "1000000000000000000";
const onHundredEth = "100000000000000000000";
const oneThousandEth = "1000000000000000000000";
const tenThousandEth = "10000000000000000000000";
const fiftyThousandEth = "50000000000000000000000";

//sETH Address
const sethAddress = "0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb";

contract("zUniPool", async accounts => {
  let zUniPoolContract;
  const toWhomToIssue = accounts[1];
  const anotherUser = accounts[2];
  before(async () => {
    zUniPoolContract = await zUniPool.deployed();

    // Some risidual is recieved back when zapping in (~500-800 ETH on 10k ETH)
    await unipoolGeneralContract.methods
      .LetsInvest(sethAddress, toWhomToIssue)
      .send({ from: toWhomToIssue, value: fiftyThousandEth, gas: gas2Use });

    await unipoolGeneralContract.methods
      .LetsInvest(sethAddress, anotherUser)
      .send({ from: anotherUser, value: onHundredEth, gas: gas2Use });

    //Recieve approval from sETH Uniswap Exchange for unipool to interact with sETH LP for another user
    await uniswapExchangeContract.methods
      .approve(unipoolAddress, approval)
      .send({ from: anotherUser });

    // Recieve approval from sETH Uniswap Exchange for zUniPool to interact with sETH LP
    await uniswapExchangeContract.methods
      .approve(zUniPoolContract.address, approval)
      .send({ from: toWhomToIssue });
  });

  it("should start with 0 LP tokens staked", async () => {
    let earnedSNX = await zUniPoolContract.howMuchHasThisContractEarned();
    expect(earnedSNX.toNumber()).to.equal(0);
  });

  it("should start with 0 issued zUNI", async () => {
    let zUniSupply = await zUniPoolContract.totalSupply();
    expect(zUniSupply).to.be.bignumber.equal("0");
  });

  it("Should allow staking", async () => {
    let LpBalance = await uniswapExchangeContract.methods
      .balanceOf(toWhomToIssue)
      .call();
    expect(LpBalance).to.be.bignumber.above("0");
    let halfOfBalance = web3.utils.fromWei(LpBalance, "ether") / 2;

    halfOfBalance = web3.utils.toWei(halfOfBalance.toString());
    let zUniRecieved = await zUniPoolContract.stakeMyShare(halfOfBalance, {
      from: toWhomToIssue
    });
    expect(zUniRecieved.receipt.status).to.be.true;
    let stakedInContract = await zUniPoolContract.howMuchHasThisContractStaked();
    expect(stakedInContract).to.bignumber.equal(halfOfBalance);
  });

  it("Should issue the first zUNI tokens at a 1:1 ratio", async () => {
    let zUniBalance = await zUniPoolContract.balanceOf(toWhomToIssue);
    let zUniPrice = await zUniPoolContract.howMuchIszUNIWorth(zUniBalance);
    let tokenStakedinZUnipool = await zUniPoolContract.totalLPTokensStaked();
    expect(zUniBalance).to.be.bignumber.equal(tokenStakedinZUnipool);
    expect(zUniPrice).to.be.bignumber.equal(zUniBalance);
  });

  it("Should earn SNX when sETH LP tokens are staked", async () => {
    let earnedSNXBefore = await zUniPoolContract.howMuchHasThisContractEarned();
    await unipoolContract.methods.stake(oneSethLP).send({ from: anotherUser }); //Send 1 sETH LP to Unipool contract to update forked mainnet state
    expect(earnedSNXBefore).to.be.bignumber.equal("0");

    let timeDeposited = await time.latest();

    await timeIncreaseTo(timeDeposited.add(time.duration.hours(3)));
    let snxBalance = await snxContract.methods
      .balanceOf("0x48D7f315feDcaD332F68aafa017c7C158BC54760")
      .call();
    console.log(web3.utils.fromWei(snxBalance));

    let earnedSNXAfter = await zUniPoolContract.howMuchHasThisContractEarned();
    expect(earnedSNXAfter).to.be.bignumber.above("0");
  });

  // it("Should rebalance by acquiring more sETH LP with earned SNX ", async () => {
  //   let earnedSNXBefore = await zUniPoolContract.howMuchHasThisContractEarned();
  //   console.log("EARNED SNX", web3.utils.fromWei(earnedSNXBefore));
  //   let zUniRecieved = await zUniPoolContract.stakeMyShare(oneSethLP, {
  //     from: toWhomToIssue
  //   });
  //   let earnedSNXAfter = await zUniPoolContract.howMuchHasThisContractEarned();
  //   console.log("EARNED SNX", web3.utils.fromWei(earnedSNXAfter));
  // });
});