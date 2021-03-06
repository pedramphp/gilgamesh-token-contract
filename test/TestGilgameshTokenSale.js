const GilgameshTokenSaleMock = artifacts.require("./GilgameshTokenSaleMock.sol");
const GilgameshToken = artifacts.require("./GilgameshToken.sol");

const MetaCoin = artifacts.require("./MetaCoin.sol");

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
const expect = chai.expect;
const assertChai = chai.assert;

const INVALID_OPCODE = "VM Exception while processing transaction: invalid opc";

contract("TestGilgameshTokenSale", (accounts) => {
	let token;

	beforeEach(async () => {
		token = await GilgameshToken.deployed();
	});

	const toEther = value => web3.fromWei(value, "ether");
	const getBalance = addr => web3.eth.getBalance(addr).toNumber();
	const toWei = value => web3.toWei(String(value), "ether");

	const createTokenSale = async ({
		startBlock = 1000,
		endBlock = 2000,
		fundOwnerWallet = accounts[ 1 ],
		tokenOwnerWallet = accounts[ 2 ],
		totalStages = 2,
		stageMaxBonusPercentage = 20,
		tokenPrice = 2000,
		minimumCap = 5 * 10 ** 18,
		owner = accounts[ 0 ],
		gilgameshToken,
		blockNumber = 1,
	} = {}) => {
		gilgameshToken = gilgameshToken === undefined ? token.address : gilgameshToken;

		const tokenSaleParams = [
			startBlock, // starting block number
			endBlock, // ending block number
			fundOwnerWallet, // fund owner wallet address - transfer ether to this address after fund has been closed
			tokenOwnerWallet, // token fund owner wallet address - transfer GIL tokesn to this address after fund is finalized
			totalStages, // total number of bonus stages
			stageMaxBonusPercentage, // maximum percentage for bonus in the first stage
			tokenPrice, // price of each token in wei
			gilgameshToken, // address of the gilgamesh ERC20 token contract
			minimumCap, // minimum cap, minimum amount of wei to be raised
			blockNumber, // override the current block number
		];

		let sale;
		try {
			// instantiate a new contract
			sale = await GilgameshTokenSaleMock.new(...tokenSaleParams, { from: owner });
		} catch (e) {
			throw new Error(e);
		}

		assert.equal(await sale.startBlock(), startBlock, "`startBlock` should match");
		assert.equal(await sale.endBlock(), endBlock, "`endBlock` should match");
		assert.equal(await sale.fundOwnerWallet(), fundOwnerWallet, "`fundOwnerWallet` should match");
		assert.equal(await sale.tokenOwnerWallet(), tokenOwnerWallet, "`tokenOwnerWallet` should match");
		assert.equal(await sale.tokenPrice(), tokenPrice, "`tokenPrice` should match");
		assert.equal(await sale.token(), token.address, "`token` should match");
		assert.equal(await sale.minimumCap(), minimumCap, "`minimumCap` should match");
		assert.equal(await sale.totalStages(), totalStages, "`totalStages` should match");
		assert.equal(await sale.stageMaxBonusPercentage(), stageMaxBonusPercentage, "`stageMaxBonusPercentage` should match");

		await token.changeMinter(sale.address);

		return sale;
	};

	describe.skip("token be deployed sucessfully deployment", () => {
		it("default parameters", () => {
			createTokenSale();
		});

		it("invalid fundOwnerWallet should fail", () => {
			assertChai.isRejected(createTokenSale({ fundOwnerWallet: 0x0 }));
		});

		it("invalid tokenOwnerWallet should fail", () => {
			assertChai.isRejected(createTokenSale({ tokenOwnerWallet: 0x0 }));
		});

		it("start block should be less than ending block", async () => {
			assertChai.isRejected(createTokenSale({ startBlock: 100, endBlock: 100 }));
			assertChai.isRejected(createTokenSale({ startBlock: 100, endBlock: 99 }));
		});

		it.skip("start block after the current block", async () => {
			assertChai.isRejected(createTokenSale({ startBlock: 100, blockNumber: 110 }));
			//
			// const startBlock = await (await createTokenSale({ startBlock: 100, blockNumber: 110 })).startBlock();
			// console.log("startBlock", startBlock);
		});

		it("Total stages should be more than or equal 2", async () => {
			assertChai.isRejected(createTokenSale({ totalStages: 1 }));
			assertChai.isFulfilled(createTokenSale({ totalStages: 2 }));
		});

		it("`stageMaxBonusPercentage` should be in a range of 0 to 100", async () => {
			assertChai.isRejected(createTokenSale({ stageMaxBonusPercentage: 101 }));
			assertChai.isFulfilled(createTokenSale({ stageMaxBonusPercentage: 80 }));
		});

		it("stage bonus percentage needs to be devisible by number of stages", async () => {
			assertChai.isRejected(createTokenSale({ stageMaxBonusPercentage: 80, totalStages: 3 }));
			assertChai.isFulfilled(createTokenSale({ stageMaxBonusPercentage: 80, totalStages: 4 }));
		});

		it("total number of blocks needs to be devisible by the total stages", async () => {
			assertChai.isRejected(createTokenSale({ startBlock: 20, endBlock: 30, totalStages: 20 }));
			assertChai.isFulfilled(createTokenSale({ startBlock: 20, endBlock: 30, totalStages: 10 }));
		});
	});

	/* ------------------------
	 * Test Public methods
	 * --------------------- */

	describe.only("deposit() test cases", () => {
		it("it should fail if the sale hasn't started", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale hasn't been started
			await sale.setMockedBlockNumber(900);

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.1),
				}),
			);
		});

		it("it should fail if the e sale has reached end block", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(2000);

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.1),
				}),
			);
		});

		it("it should fail if the cap has reached", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			await sale.setCapHasReached(true);

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("it should fail if sale has stopped", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			await sale.emergencyStopSale();

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("it should fail if sale is finalized", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			await sale.finalizeSale();

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("it should fail if it doesn't meet minimum contribution", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.009),
				}),
			);
		});

		it("it should fail if the address is invalid", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			assertChai.isRejected(
				sale.deposit({
					from: 0x0,
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("it should fail if it exceeds hard cap", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			await sale.setTotalRaised(toWei(1000000));

			assertChai.isRejected(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("it should not fail if it has met all the requirements", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			assertChai.isFulfilled(
				sale.deposit({
					from: accounts[ 2 ],
					gas: 200000,
					value: toWei(0.01),
				}),
			);
		});

		it("if it reaches hard cap isCapReached should be true", async () => {
			const sale = await createTokenSale();
			// it should fail if the sale has reached end block
			await sale.setMockedBlockNumber(1000);

			await sale.setTotalRaised(toWei(1000000 - 0.01));
			await sale.deposit({
				from: accounts[ 2 ],
				gas: 200000,
				value: toWei(0.01),
			});

			assert(await sale.isCapReached(), true, "cap should be reached");
		});

		it("receive token for successuful payment", async () => {
			// const userAddress = accounts[ 4 ];
			// const sale = await createTokenSale({
			// 	startBlock: 900,
			// });
			// const tokenBalance = await token.balanceOf(userAddress);
			// console.log("token minter", await token.minter());
			// console.log("sale address", sale.address);
			// console.log("token balance", tokenBalance.valueOf());
			// console.log("ether balance", toEther(getBalance(userAddress)));
			//
			// assert.isOk("everything", "everything is ok");
			//
			// await sale.setMockedBlockNumber(1000);

			// await sale.deposit({
			// 	value: toWei(0.1),
			// 	from: userAddress,
			// });
			// console.log("toWei(0.1)", toWei(0.1));
			// console.log("number of tokens", (await sale.calculateTokens(toWei(0.1))).valueOf());

			// console.log(await token.balanceOf(accounts[ 4 ]));
		});
	});

	describe("emergencyStopSale() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.emergencyStopSale({
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should fail if the sale is not active ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(100);

			assertChai.isRejected(
				sale.emergencyStopSale(),
			);
		});

		it("it should pass if the sale is still active ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(1000);

			await sale.emergencyStopSale();

			assert.equal(await sale.saleStopped(), true, "sale should be stopped");
		});
	});

	describe("restartSale() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.restartSale({
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should fail if the sale is not during sale period ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(100);

			assertChai.isRejected(
				sale.restartSale(),
			);
		});

		it("it should fail if the sale is not during sale period ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(100);

			assertChai.isRejected(
				sale.restartSale(),
			);
		});

		it("it should fail if the sale is still on going ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(1000);

			assertChai.isRejected(
				sale.restartSale(),
			);
		});

		it("it should not fail it's by the owner and sale has been stopped and is during sale period ", async () => {
			const sale = await createTokenSale();

			await sale.setMockedBlockNumber(1000);

			await sale.emergencyStopSale();

			try {
				sale.restartSale();
			} catch (e) {
				assert.fail("it should not fail");
			}

			assert.equal(await sale.saleStopped(), false, "sale should not be stopped");
		});
	});

	describe("changeFundOwnerWalletAddress() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeFundOwnerWalletAddress(accounts[ 3 ], {
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should fail it has passed invalid address ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeFundOwnerWalletAddress(0x0),
			);
		});

		it("it should fail it has passed invalid address ", async () => {
			const sale = await createTokenSale();

			await sale.changeFundOwnerWalletAddress(accounts[ 3 ]);

			assert.equal(await sale.fundOwnerWallet(), accounts[ 3 ], "verify fund owner new address");
		});
	});

	describe("changeTokenOwnerWalletAddress() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeTokenOwnerWalletAddress(accounts[ 3 ], {
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should fail it has passed invalid address ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeTokenOwnerWalletAddress(0x0),
			);
		});

		it("it should fail it has passed invalid address ", async () => {
			const sale = await createTokenSale();

			await sale.changeTokenOwnerWalletAddress(accounts[ 4 ]);

			assert.equal(await sale.tokenOwnerWallet(), accounts[ 4 ], "verify token owner new address");
		});
	});

	describe("finalizeSale() test cases", () => {
		const tokenPrice = 2000;
		const investedEther = 0.1; 	// 0.1 of 2000 = 200
		const userAddress = accounts[ 1 ];
		const giglameshTokenAddress = accounts[ 3 ];
		const gilgameshEthAddress = accounts[ 2 ];
		const toTokenNumber = bNumber => bNumber.dividedBy(10 ** 18).toNumber();

		it("only owner can finalize the sale", async () => {
			const sale = await createTokenSale({
				startBlock: 10,
				blockNumber: 8,
				endBlock: 100,
				tokenPrice,
				totalStages: 3,
				stageMaxBonusPercentage: 18,
				fundOwnerWallet: gilgameshEthAddress,
				tokenOwnerWallet: giglameshTokenAddress,
			});
			const decimals = 10 ** (await token.decimals()).toNumber();

			const gilgameshFunCurrentBalance = getBalance(gilgameshEthAddress);

			await sale.setMockedBlockNumber(99);
			await sale.deposit({
				from: userAddress,
				value: toWei(investedEther),
			});

			// check token contract total supply: 200
			assert.equal(
				toTokenNumber(await token.totalSupply.call()),
				tokenPrice * investedEther,
				"check token contract total supply: 200",
			);

			// check token contract user supply: 200
			assert.equal(
				toTokenNumber(await token.balanceOf.call(userAddress)),
				tokenPrice * investedEther,
				"check token contract user supply: 200",
			);

			// check total amount of Ether raised from token sale contract
			assert.equal(
				await sale.totalRaised(),
				toWei(investedEther),
				"check total amount of Ether raised from token sale contract",
			);

			// check gilgamesh dev account balance - make sure ether has been moved to gilgamesh dev account.
			// current balance - previous balance == deposited amount
			assert.equal(
				getBalance(gilgameshEthAddress) - gilgameshFunCurrentBalance,
				toWei(investedEther),
				"Gilgamesh Dev balance should be updated",
			);

			await sale.deposit({
				from: userAddress,
				value: toWei(investedEther),
			});

			// check total amount of Ether raised from token sale contract
			assert.equal(
				await sale.totalRaised(),
				toWei(investedEther * 2),
				"check total amount of Ether raised from token sale contract",
			);

			// only owner can finalize the sale
			assertChai.isRejected(
				sale.finalizeSale.call({
					from: userAddress,
				}),
			);

			// owner finalize the sale
			await sale.finalizeSale();

			// sale should have been stopped
			assert.equal(await sale.saleStopped(), true, "sale should have been stopped");
			// sale has been finalized
			assert.equal(await sale.saleFinalized(), true, "sale should have been finalized");

			// check if giglgamesh team have received their tokens.
			// total invested 0.2 ether = (400) token * 3 = 1200 for the team.
			// check token contract user supply: 200
			assert.equal(
				toTokenNumber(await token.balanceOf.call(giglameshTokenAddress)),
				tokenPrice * (investedEther * 2) * 3,
				"check token contract gigamesh team user supply: 1200",
			);

			// finalizing the sale after its finalized should fail
			assertChai.isRejected(
				sale.finalizeSale.call(),
			);

			// future deposit should fail after sale has stopped
			assertChai.isRejected(
				sale.deposit({
					from: userAddress,
					value: toWei(investedEther),
				}),
			);
		});
	});

	describe("changeCap() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			assertChai.isRejected(
				sale.changeCap(toWei(10000), {
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should fail for caps less than minimumCap ", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			assertChai.isRejected(
				sale.changeCap(toWei(8)),
			);
		});

		it("it should fail if it is not more than the total raised", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			await sale.setTotalRaised(toWei(40));

			assertChai.isRejected(
				sale.changeCap(toWei(40)),
			);

			assertChai.isRejected(
				sale.changeCap(toWei(39)),
			);
		});

		it("it should fail if it is not more than the hard cap", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			await sale.setTotalRaised(toWei(40));

			assertChai.isRejected(
				sale.changeCap(toWei(1000000)),
			);

			assertChai.isRejected(
				sale.changeCap(toWei(1000001)),
			);
		});

		it("it should not fail if it the cap is more than the amount raised.", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			await sale.setTotalRaised(toWei(40));

			// more than total raised should be fulfilled;
			assertChai.isFulfilled(
				sale.changeCap(toWei(41)),
			);
		});

		it("if it is more than the hard cap it should finalize sale", async () => {
			const sale = await createTokenSale({
				minimumCap: toWei(10),
			});

			const newCap = toWei(1000);

			// if it has raised at least 1 finney less than new hard cap.
			await sale.setTotalRaised(newCap - toWei(0.01));

			// more than total raised should be fulfilled;
			await sale.changeCap(newCap);

			assert.equal(await sale.isCapReached(), true, "cap has been reached");

			// sale should have been stopped
			assert.equal(await sale.saleStopped(), true, "sale should have been stopped");

			// sale has been finalized
			assert.equal(await sale.saleFinalized(), true, "sale should have been finalized");
		});
	});

	describe("removeContract() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.removeContract({
					from: accounts[ 4 ], // non owner account
				}),
			);
		});

		it("it should if the sale is still active", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.removeContract(),
			);
		});

		it("it should transfer funds to the owner", async () => {
			const sale = await createTokenSale();
			const userAddress = accounts[ 3 ];
			const previousBalance = getBalance(accounts[ 0 ]);

			web3.eth.defaultAddress = accounts[ 0 ];

			await sale.setMockedBlockNumber(1000);

			// deposit some cash
			await sale.deposit({
				from: userAddress,
				value: toWei(0.1),
			});

			// owner finalize the sale
			await sale.finalizeSale();

			// remove the contract
			try {
				await sale.removeContract();
			} catch (e) {
				// it shouln't fail
				assert.fail("it should remove the contract successfully");
			}
		});
	});

	describe("changeOwner() test cases", () => {
		it("it should fail it is called by non owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeOwner.call(accounts[ 1 ], {
					from: accounts[ 4 ],
				}),
			);
		});

		it("it should fail it is assigned to the same owner ", async () => {
			const sale = await createTokenSale();

			assertChai.isRejected(
				sale.changeOwner.call(web3.eth.defaultAccount),
			);
		});

		it("shouldn't be able to reassign owner from the previous owner", async () => {
			const sale = await createTokenSale();
			const newOwner = await sale.changeOwner(accounts[ 2 ]);
			// owner has been changed
			assert.equal(await sale.owner(), accounts[ 2 ]);

			// can't change owner because the owner is changed
			try {
				await sale.changeOwner(accounts[ 3 ]);
				assert.fail("should not be able to change the owner from default owner");
			} catch (e) {
				assert.isOk("it should fail");
			}
		});
	});

	describe("() payable test cases", () => {
		it("0.1 ether has been sent to fundOwnerAddress", async () => {
			const sale = await createTokenSale({
				fundOwnerWallet: accounts[ 3 ],
			});
			const toTokenNumber = bNumber => bNumber.dividedBy(10 ** 18).toNumber();

			const fundOwnerPrevBalance = getBalance(accounts[ 3 ]);
			await sale.setMockedBlockNumber(1000);

			await web3.eth.sendTransaction({
				from: accounts[ 2 ],
				gas: 200000,
				value: toWei(0.1),
				to: sale.address,
			});

			assert.equal(getBalance(accounts[ 3 ]) - fundOwnerPrevBalance, toWei(0.1));
		});
	});

	/* ------------------------
	 * /Test Public methods
	 * --------------------- */

	/* ------------------------
	 * Test Internal methods
	 * --------------------- */
	describe("isDuringSalePeriod() test cases", () => {
		it("should return false for block numbers less than starting block ", async () => {
			const sale = await createTokenSale({
				startBlock: 900,
			});
			// using `.call` to explicitly call the method rather than the transaction.
			assert.isFalse(await sale.isDuringSalePeriodMock.call(800));
		});

		it("should return true for block numbers between the starting block and end block", async () => {
			const sale = await createTokenSale({
				startBlock: 900,
				endBoock: 1000,
			});

			assert.isTrue(await sale.isDuringSalePeriodMock.call(900));
			assert.isTrue(await sale.isDuringSalePeriodMock.call(950));
			assert.isTrue(await sale.isDuringSalePeriodMock.call(999));
		});

		it("should return false for block numbers more than end block", async () => {
			const sale = await createTokenSale({
				startBlock: 900,
				endBlock: 1000,
			});

			assert.isFalse(await sale.isDuringSalePeriodMock.call(1000));
			assert.isFalse(await sale.isDuringSalePeriodMock.call(1001));
		});
	});

	describe("getStageByBlockNumber() test cases", () => {
		it("test all use cases for getStageByBlockNumber() function", async () => {
			let sale = await createTokenSale({
				startBlock: 10,
				endBlock: 20,
				totalStages: 2,
				stageMaxBonusPercentage: 20,
			});

			// helper function
			// needs .toNumber() because it returns a bigNumber
			const getStageByBlockNumber = async blockNumber => (await sale.getStageByBlockNumberMock.call(blockNumber)).toNumber();

			assertChai.isRejected(sale.getStageByBlockNumberMock.call(9));
			assertChai.isRejected(sale.getStageByBlockNumberMock.call(20));

			// 10 to 14 are at stage 1
			assert.equal(await getStageByBlockNumber(10), 1);
			assert.equal(await getStageByBlockNumber(11), 1);
			assert.equal(await getStageByBlockNumber(12), 1);
			assert.equal(await getStageByBlockNumber(13), 1);
			assert.equal(await getStageByBlockNumber(14), 1);
			// // 14 to 20 are at stage 2
			assert.equal(await getStageByBlockNumber(15), 2);
			assert.equal(await getStageByBlockNumber(16), 2);
			assert.equal(await getStageByBlockNumber(17), 2);
			assert.equal(await getStageByBlockNumber(18), 2);
			assert.equal(await getStageByBlockNumber(19), 2);

			sale = await createTokenSale({
				startBlock: 10,
				endBlock: 20,
				totalStages: 5,
				stageMaxBonusPercentage: 20,
			});

			assert.equal(await getStageByBlockNumber(10), 1);
			assert.equal(await getStageByBlockNumber(11), 1);
			assert.equal(await getStageByBlockNumber(12), 2);
			assert.equal(await getStageByBlockNumber(13), 2);
			assert.equal(await getStageByBlockNumber(14), 3);
			assert.equal(await getStageByBlockNumber(15), 3);
			assert.equal(await getStageByBlockNumber(16), 4);
			assert.equal(await getStageByBlockNumber(17), 4);
			assert.equal(await getStageByBlockNumber(18), 5);
			assert.equal(await getStageByBlockNumber(19), 5);

			sale = await createTokenSale({
				startBlock: 10,
				endBlock: 20,
				totalStages: 10,
				stageMaxBonusPercentage: 20,
			});

			assert.equal(await getStageByBlockNumber(10), 1);
			assert.equal(await getStageByBlockNumber(11), 2);
			assert.equal(await getStageByBlockNumber(12), 3);
			assert.equal(await getStageByBlockNumber(13), 4);
			assert.equal(await getStageByBlockNumber(14), 5);
			assert.equal(await getStageByBlockNumber(15), 6);
			assert.equal(await getStageByBlockNumber(16), 7);
			assert.equal(await getStageByBlockNumber(17), 8);
			assert.equal(await getStageByBlockNumber(18), 9);
			assert.equal(await getStageByBlockNumber(19), 10);
		});
	});

	describe("calculateTokens() test cases", () => {
		it("return 0 tokens if it is not during the crowdfund", async () => {
			const sale = await createTokenSale({
				startBlock: 20,
				endBlock: 100,
			});

			// less than start block number
			await sale.setMockedBlockNumber(19);
			assert.equal(await sale.calculateTokensMock.call(250), 0);

			// more than or equal end block number
			await sale.setMockedBlockNumber(100);
			assert.equal(await sale.calculateTokensMock.call(250), 0);

			// more than or equal end block number
			await sale.setMockedBlockNumber(101);
			assert.equal(await sale.calculateTokensMock.call(250), 0);
		});

		it("calculate tokesn for 2 stages and 20% max bonus", async () => {
			const tokenPrice = 1000;
			const totalStages = 2;
			const stageMaxBonusPercentage = 20;

			const sale = await createTokenSale({
				startBlock: 20,
				endBlock: 100,
				tokenPrice, // 1 ether gives you 1000 tokens
				totalStages,
				stageMaxBonusPercentage,
			});

			const oneEther = toWei(1);
			const decimals = 10 ** 18;

			await sale.setMockedBlockNumber(20);
			let totalTokens = (await sale.calculateTokensMock.call(oneEther)).dividedBy(decimals).toNumber();

			// 1000 + 20% profit = 1200
			assert.equal(totalTokens, 1200);

			await sale.setMockedBlockNumber(99);
			totalTokens = (await sale.calculateTokensMock.call(oneEther)).dividedBy(decimals).toNumber();

			assert.equal(totalTokens, 1000);
		});

		it("calculate tokesn for 3 stages and 18% max bonus", async () => {
			const tokenPrice = 2000; // 1 ether gives you 2000 tokens
			const totalStages = 3;
			const stageMaxBonusPercentage = 18;

			const oneEther = toWei(1);
			const decimals = 10 ** (await token.decimals()).toNumber();

			// mocking rea
			const sale = await createTokenSale({
				startBlock: 10,
				endBlock: 100,
				tokenPrice,
				totalStages: 3,
				stageMaxBonusPercentage,
			});

			// stage one test
			await sale.setMockedBlockNumber(10);
			let totalTokens = (await sale.calculateTokensMock.call(oneEther / 2000)).dividedBy(decimals).toNumber();
			// 2000 + 18% profit = 2360
			assert.equal(totalTokens, 2360 / 2000);

			// stage two test
			await sale.setMockedBlockNumber(40);
			totalTokens = (await sale.calculateTokensMock.call(oneEther / 2000)).dividedBy(decimals).toNumber();
			// 2000 + 9% profit = 2180
			assert.equal(totalTokens, 2180 / 2000);

			// stage three test
			await sale.setMockedBlockNumber(70);
			totalTokens = (await sale.calculateTokensMock.call(oneEther / 2000)).dividedBy(decimals).toNumber();
			assert.equal(totalTokens, 2000 / 2000);

			// stage three test
			await sale.setMockedBlockNumber(99);
			totalTokens = (await sale.calculateTokensMock.call(oneEther / 2000)).dividedBy(decimals).toNumber();
			assert.equal(totalTokens, 2000 / 2000);
		});
	});

	describe("calculateRewardTokens() test cases", () => {
		it("fail if stage number is invalid", async () => {
			const sale = await createTokenSale({
				startBlock: 10,
				endBlock: 100,
				tokenPrice: 2000,
				totalStages: 3,
				stageMaxBonusPercentage: 18,
			});

			assertChai.isRejected(sale.calculateRewardTokensMock.call(100, 5));
			assertChai.isRejected(sale.calculateRewardTokensMock.call(100, 4));
			assertChai.isRejected(sale.calculateRewardTokensMock.call(100, 0));
		});

		it("return valid reward", async () => {
			const sale = await createTokenSale({
				startBlock: 10,
				endBlock: 100,
				tokenPrice: 2000,
				totalStages: 3,
				stageMaxBonusPercentage: 18,
			});

			let reward = (await sale.calculateRewardTokensMock.call(100, 1)).toNumber();
			assert.equal(reward, 18);

			reward = (await sale.calculateRewardTokensMock.call(100, 2)).toNumber();
			assert.equal(reward, 9);

			reward = (await sale.calculateRewardTokensMock.call(100, 3)).toNumber();
			assert.equal(reward, 0);
		});
	});
	/* ------------------------
	 * /Test internal methods
	 * --------------------- */
});
