import { PGlite as Base } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
export class PGlite extends Base {
  constructor() {
    super({ extensions: { pgcrypto, btree_gist } });
  }
}
