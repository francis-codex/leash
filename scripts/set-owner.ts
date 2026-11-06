// hand the vault to a new owner wallet (e.g. phantom).
//   npx tsx scripts/set-owner.ts <address>        simulate only
//   npx tsx scripts/set-owner.ts <address> --go   send it
// one transaction: add the new owner with every permission, remove the old
// owner, make the new owner the config authority. the fees wallet pays.
import * as multisig from "@sqds/multisig";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { connection, explorer, kp, pk, readState, simulateThenSend, writeState } from "./common";

const { Permissions } = multisig.types;

async function main() {
  const [addr, flag] = process.argv.slice(2);
  if (!addr) throw new Error("usage: set-owner.ts <address> [--go]");
  const next = new PublicKey(addr);
  if (next.toBase58() !== addr) throw new Error("not a canonical address");

  const s = readState();
  const fees = kp("fees");
  const owner = kp("owner");
  if (owner.publicKey.toBase58() !== s.owner) throw new Error(".keys/owner.json is not the current owner");
  if (next.equals(owner.publicKey)) throw new Error("that is already the owner");
  const multisigPda = pk(s, "multisig");

  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  if (!ms.configAuthority.equals(owner.publicKey)) throw new Error("current owner is not the config authority");

  const ixs = [
    multisig.instructions.multisigAddMember({
      multisigPda,
      configAuthority: owner.publicKey,
      rentPayer: fees.publicKey,
      newMember: { key: next, permissions: Permissions.all() },
      memo: "leash: new owner",
    }),
    multisig.instructions.multisigRemoveMember({
      multisigPda,
      configAuthority: owner.publicKey,
      oldMember: owner.publicKey,
    }),
    multisig.instructions.multisigSetConfigAuthority({
      multisigPda,
      configAuthority: owner.publicKey,
      newConfigAuthority: next,
    }),
  ];
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({ payerKey: fees.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(),
  );
  tx.sign([fees, owner]);

  if (flag !== "--go") {
    const sim = await connection.simulateTransaction(tx, { sigVerify: true });
    console.log(sim.value.err ? `simulation failed: ${JSON.stringify(sim.value.err)}` : "simulation ok");
    console.log((sim.value.logs ?? []).filter((l) => /error|failed/i.test(l)).join("\n"));
    return;
  }

  const r = await simulateThenSend(tx, false);
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  const after = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  console.log("sent", explorer(r.sig!));
  console.log("members", after.members.map((m) => `${m.key.toBase58()}:${m.permissions.mask}`).join(" "));
  console.log("config authority", after.configAuthority.toBase58());
  writeState({ ...s, previousOwner: s.owner, owner: next.toBase58(), ownerTx: r.sig! });
  console.log("state updated. now update LEASH_STATE on vercel and redeploy.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
