import * as multisig from "@sqds/multisig";
import { connection, pk, readState } from "./common";
const s = readState();
(async()=>{const m = await multisig.accounts.Multisig.fromAccountAddress(connection, pk(s,"multisig"));
console.log("txIndex", m.transactionIndex.toString(), "stale", m.staleTransactionIndex.toString());
for (const i of [1n,2n]) {
  const [t] = multisig.getTransactionPda({ multisigPda: pk(s,"multisig"), index: i });
  const [p] = multisig.getProposalPda({ multisigPda: pk(s,"multisig"), transactionIndex: i });
  console.log(i, !!(await connection.getAccountInfo(t)), !!(await connection.getAccountInfo(p)));
}})();
