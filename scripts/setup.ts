import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { connection, kp, network, newKp, readState, writeState, explorer } from "./common";

const { Permission, Permissions } = multisig.types;

// lean numbers: $0.10 per pay, $1/day cap, $2 in the vault
const DAILY_CAP = 1_000_000n;
const VAULT_FUND = 2_000_000n;

async function main() {
  const s = readState();
  const fees = kp("fees");
  const owner = kp("owner");
  const agent = kp("agent");
  const vendors = ["vendor-1", "vendor-2", "vendor-3"].map(kp);
  const decoys = ["decoy-1", "decoy-2"].map(kp);
  console.log(`network ${network}  fees ${fees.publicKey.toBase58()}`);
  console.log(`fees balance ${(await connection.getBalance(fees.publicKey)) / 1e9} SOL`);

  // 1. mint: devnet gets our own 6-decimal test usdc, mainnet uses real USDC
  if (!s.mint) {
    if (network === "devnet") {
      const mintKp = newKp("mint");
      const mint = await createMint(connection, fees, fees.publicKey, null, 6, mintKp);
      s.mint = mint.toBase58();
    } else {
      s.mint = "EPjFWJd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    }
    writeState(s);
  }
  const mint = new PublicKey(s.mint);
  console.log("mint", s.mint);

  // 2. multisig: owner = everything + config authority, agent = initiate only
  if (!s.multisig) {
    const createKey = newKp("multisig-create-key");
    const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
    const [programConfigPda] = multisig.getProgramConfigPda({});
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda,
    );
    console.log("squads creation fee", programConfig.multisigCreationFee.toString());
    const sig = await multisig.rpc.multisigCreateV2({
      connection,
      treasury: programConfig.treasury,
      createKey,
      creator: fees,
      multisigPda,
      configAuthority: owner.publicKey,
      threshold: 1,
      members: [
        { key: owner.publicKey, permissions: Permissions.all() },
        { key: agent.publicKey, permissions: Permissions.fromPermissions([Permission.Initiate]) },
      ],
      timeLock: 0,
      rentCollector: fees.publicKey,
    });
    await connection.confirmTransaction(sig, "confirmed");
    s.multisig = multisigPda.toBase58();
    s.multisigTx = sig;
    writeState(s);
    console.log("multisig", s.multisig, explorer(sig));
  }
  const multisigPda = new PublicKey(s.multisig);
  const [vault] = multisig.getVaultPda({ multisigPda, index: 0 });
  s.vault = vault.toBase58();

  // 3. token accounts for vault, vendors, decoys (decoys need one so off-list fails as InvalidDestination)
  const vaultAta = await getOrCreateAssociatedTokenAccount(connection, fees, mint, vault, true);
  s.vaultAta = vaultAta.address.toBase58();
  for (const [i, v] of [...vendors, ...decoys].entries()) {
    const name = i < 3 ? `vendor-${i + 1}` : `decoy-${i - 2}`;
    const ata = await getOrCreateAssociatedTokenAccount(connection, fees, mint, v.publicKey);
    s[name] = v.publicKey.toBase58();
    s[`${name}Ata`] = ata.address.toBase58();
  }
  writeState(s);

  // 4. fund the vault (devnet: mint test usdc)
  if (network === "devnet" && vaultAta.amount < VAULT_FUND) {
    await mintTo(connection, fees, mint, vaultAta.address, fees, VAULT_FUND - vaultAta.amount);
  }
  console.log("vault", s.vault, "ata", s.vaultAta);

  // 5. spending limit: agent only, vendors only, $1/day
  if (!s.spendingLimit) {
    const slCreateKey = newKp("spending-limit-create-key").publicKey;
    const [spendingLimit] = multisig.getSpendingLimitPda({ multisigPda, createKey: slCreateKey });
    const sig = await multisig.rpc.multisigAddSpendingLimit({
      connection,
      feePayer: fees,
      multisigPda,
      configAuthority: owner.publicKey,
      spendingLimit,
      rentPayer: fees,
      createKey: slCreateKey,
      vaultIndex: 0,
      mint,
      amount: DAILY_CAP,
      period: multisig.types.Period.Day,
      members: [agent.publicKey],
      destinations: vendors.map((v) => v.publicKey),
      signers: [owner],
    });
    await connection.confirmTransaction(sig, "confirmed");
    s.spendingLimit = spendingLimit.toBase58();
    s.spendingLimitTx = sig;
    writeState(s);
    console.log("spending limit", s.spendingLimit, explorer(sig));
  }

  s.owner = owner.publicKey.toBase58();
  s.agent = agent.publicKey.toBase58();
  s.fees = fees.publicKey.toBase58();
  s.network = network;
  writeState(s);
  console.log("done. state in .keys/state.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
