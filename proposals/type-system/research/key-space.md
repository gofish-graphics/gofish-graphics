# The key space: a type-theoretic account for GoFish

Research note for "GoFish Goes to School" (Section 7, "Keys and values"). Status is research, with nothing signed off. Written 2026-11-12.

This note answers the five questions that Section 7 of the draft defers. It reads Hannah Aizenman's model of datasets as fiber bundles and sheaves, translates each piece into type theory, surveys other typed precedent for key spaces, reads how GoFish treats keys today, and then proposes a small account of keys for GoFish. Every proposed type comes with a real example and the error or default it produces.

## Summary

- A table is a function from a key type to records. A key type is a finite set of values with equality. Traits on a key say how keys relate to each other. The proposal has five key traits, and three of them exist in GoFish today under these or nearby names:
  - `HasOrder` exists. It gives each key a next key.
  - `HasCycle` exists for calendar parts. It gives each key a next key, and the last key's next key is the first.
  - `HasParent` is new as a name. It already exists as `KeyCell.parent` for bin chains, and as the nesting of `by`.
  - `HasRegion` exists as the phantom `hasRegion` flag on `FieldExpr<true>`, which `partition` already requires.
  - `HasNeighbors` is new. It is the common parent of the three above that have a neighbor relation, and an edge table supplies it for a general graph.
- The pipeline keeps a key context, written Δ. It is the list of keys that the `by` options above a point have fixed. Each splitting operator adds one key to Δ. The additivity check reads Δ at the mark. A channel aggregate such as `field("v").sum()` folds over the part of the value's own key that Δ has not fixed, and `stack(k)` and `treemap(k)` add over `k`. Each of these needs the value to be `Extensive` over that key.
- Keys versus values in graphical space comes down to one rule. The key always picks which mark is drawn. Along each axis, a mark's position comes either from its key (`spread`, `table`, `partition`) or from a value (`scatter`, a channel, or the running sum in `stack`). `stack` is the one operator that turns a key into a position by adding values, which is why it is the operator that needs additivity.
- Hannah's model translates almost piece by piece into ordinary dependent type theory. Sections are dependent functions, the base space is an index type with traits, an artist is a polymorphic function, and naturality (her "equivariance") follows from Reynolds parametricity as a free theorem. I did not find a very strong reason to keep the categorical form. Two of her ideas are worth keeping in type-theoretic form. The first is the map ξ from graphic parts back to data keys. The second is testing an artist by measuring its output after a change to the data.
- Multi-table support needs one idea. A foreign key is a function between key types, and `join` is substitution along it. When the join key is not a key of the right table, `join` adds a dependent key, as `by` does. One new additivity kind falls out, `Constant` (the value does not vary along the key). It catches the "fan trap", where a value copied by a join is then summed.

## 1. Hannah Aizenman's model

### 1.1 Sources

- Aizenman, Vejdemo-Johansson, Caswell, Grossberg, ["Mind Your νs and Qs: A Categorical Framework for Specifying Visualization Components"](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf), GUGOG workshop at IEEE VIS 2026. I read the full paper.
- The same authors, ["Categorical Framework for Visualization Software Architecture"](https://ieeevis.org/year/2026/program/content/1057cc86-867a-44fb-a9e8-628ca96d9ace/), TopoInVis workshop at IEEE VIS 2026. The PDF on the VIS site needs a login. The GUGOG paper says it "summarizes a yet unpublished expanded manuscript", and that manuscript is public as LaTeX in [github.com/story645/team/paper](https://github.com/story645/team/tree/main/paper) (`main.tex`, titled "Categorical Framework for Visualization Software Architecture"). I read its full text. The notes below follow the expanded manuscript where it says more.
- The earlier "Topological Equivariant Artist Model" appears only as a research title on her [HackMD profile](https://hackmd.io/@story645/ascv) and in her SciPy 2020 and 2021 talks on redesigning Matplotlib's data model. I found no separate paper under that title, and her thesis is not public. The two papers above are the current form of that work.
- The implementation work is Matplotlib's [data-prototype](https://github.com/matplotlib/data-prototype) and Kyle Sunden's data container pull request (matplotlib#30865), which the paper cites.

### 1.2 The model, piece by piece

A **fiber bundle** is a space E (the total space) with a map π from E onto a base space K, such that the part of E over each point of K (the fiber over that point) looks like one fixed space F. The paper uses only trivial bundles, where E is just K × F. The paper assigns the pieces as follows.

- **Base space K.** K is the index set of the data, and it carries the data's "connectivity". The paper gives K a topology through neighborhoods. A neighborhood of an index contains the index and can grow or shrink. For tables K is discrete, for a time series K is a line, and for a map K is a region of the plane. The expanded manuscript usually models K as a CW complex, which is a space built by gluing points, intervals, disks and so on. It also notes that the topology can be as fine as the number of records, "such that the key (continuity) value (data) pairing is always preserved". The paper turns K into a category whose objects are the neighborhoods and whose arrows are inclusions of one neighborhood in another.
- **Fiber F.** F is the space of possible records, following Spivak. A record maps each field name to a value of that field's type. The paper gives F a category with one object, whose arrows are the allowed transformations of records. A table of allowed transformations per Stevens level shows what each one must preserve, e.g., an ordinal transformation must be monotone.
- **Section τ.** A dataset is a section, a function τ that sends each index k in K to a record in the fiber over k. The paper writes its type as `dataset : connectivity → fields`. A local section is defined only on one neighborhood.
- **Data transformations.** A change of index φ̂ is a continuous map from a new base K' to K. It acts on data by precomposition, τ ↦ τ ∘ φ̂, which the paper calls "pulling back" the records to the new index. A change of values φ̃ acts on the fiber, τ ↦ φ̃ ∘ τ. A full transformation does both. The two kinds of change commute, e.g., permuting bars and then doubling their heights gives the same picture as doubling and then permuting.
- **Sheaf.** The data container (in memory, on disk, distributed, streamed) is a sheaf. A presheaf here is a rule that gives the set of sections over each neighborhood, with a restriction map from a larger neighborhood to a smaller one. A sheaf is a presheaf that also satisfies two axioms. Locality says that two sections that agree on every piece of a cover are equal. Gluing says that sections on the pieces of a cover that agree where the pieces overlap combine into one section on the union. The paper's point is that a visual algorithm written against a sheaf works the same way on data held in any container.
- **Composition.** Two index spaces combine by gluing them along a shared part (a fibered coproduct), which the paper compares to inserting new records. Two fibers combine by a fiber product over a shared field, which the paper compares to a database join on a key.
- **The map ξ.** ξ is a continuous map from the graphic's base space S back to the data's base space K. It says which data index each part of the picture shows. The paper builds S as K × [0,1]^n, so that a line (1D data) becomes a 2D stroke on screen by adding a width. ξ points from graphic to data because every visual element traces back to data, while some data may not be shown. Pullback along ξ gives the record for a point in the graphic, which is what tooltips, brushing and linking need. Pushforward along ξ gives the graphic for a data index.
- **Artist and equivariance.** An artist is a map from sections of the data bundle to sections of the graphic bundle, and the paper requires it to be a natural transformation. In practice this means the artist commutes with transformations. Changing the data and then drawing gives the same picture as drawing and then making the matching change to the picture. The paper splits this into two parts. A change of index φ̂ should move marks but not change what any mark measures. A change of value φ̃ should change the measured visual variables in a matching way that the developer specifies.
- **Verification by measurement.** Pixels are hard to compare, so the paper defines "measurable components" of a mark (a superset of Bertin's visual variables, e.g., color or x position). It pairs a function that predicts the measurements from data with a function that measures the rendered output, and a test checks that the two agree.
- **Factoring artists into ν and Q.** An encoder ν maps each record to visual values one record at a time, with no access to other records. A compositor Q turns visual values into graphic elements. Encoders compose freely.

### 1.3 What "continuity" in K encodes

In the paper, the continuity of K encodes which records are next to each other. It decides whether a mark may join records (a line joins neighbors in time) or must keep them apart (bars). The phrase "readability" in the paper means that each visual element must correspond to distinct data elements, and the paper asks ξ to be continuous so that neighboring parts of the picture show neighboring data. For finite data, which is all GoFish handles, a topology on a finite set carries exactly the information of a preorder on it. This is the Alexandrov correspondence between finite topological spaces and preorders. So in practice the continuity of a finite key set is a relation between keys, and the topology adds nothing beyond that relation.

### 1.4 Translation into type theory

Each piece of Hannah's model has a counterpart in ordinary dependent type theory. A **dependent function type**, written Π(k : K). B(k), is the type of functions that take a k of type K and return a value of a type B(k) that may depend on k. A **dependent pair type**, written Σ(k : K). B(k), is the type of pairs whose second part's type depends on the first part.

| Hannah's piece                     | Type-theoretic counterpart                                      | Notes                                                               |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Base space K                       | An index type K with traits                                     | As in Dex index sets. Neighborhoods become a trait, `HasNeighbors`. |
| Fiber F, Spivak records            | A record type, with row types for open records                  | A dependent fiber F(k) is a type family.                            |
| Section τ                          | A dependent function τ : Π(k : K). F(k)                         | For a trivial bundle, a plain function K → F.                       |
| Local sections on a neighborhood U | Π(k : U). F(k) for a subtype U of K                             | Restriction is precomposition with the inclusion.                   |
| Change of index φ̂ and pullback     | Substitution, τ ∘ φ̂                                             | Spivak's Δ migration.                                               |
| Change of value φ̃                  | Postcomposition, φ̃ ∘ τ                                          |                                                                     |
| Sheaf gluing on a cover            | A function defined by cases on a partition of K                 | Trivial when the cover is a partition. See Section 1.5.             |
| Fibered coproduct of bases         | A sum type K₁ + K₂, quotiented by the shared part               | Needs key equality across the two.                                  |
| Fiber product of fields (join)     | A pullback, Σ(a : A). Σ(b : B). f(a) = g(b)                     | Section 4.6.                                                        |
| The dataset as a whole             | A container, ⟦S ◁ P⟧ X = Σ(s : S). (P(s) → X)                   | Shape S says which keys exist, and positions P(s) are the keys.     |
| ξ from graphic to data             | A position map in a container morphism                          | See below.                                                          |
| Artist as a natural transformation | A polymorphic function ∀K. (traits on K) ⇒ Table K → Graphic K  | Naturality is a free theorem.                                       |
| Equivariance under φ̂ and φ̃         | Relational parametricity in the key type and in the value types | Section 1.6.                                                        |
| Encoder ν, pointwise               | A function on one record, F → V, mapped over the table          | Pointwise means it is a plain map over the container.               |

A **container** (Abbott, Altenkirch and Ghani, ["Containers: constructing strictly positive types"](https://doi.org/10.1016/j.tcs.2005.06.002), TCS 2005) describes a data structure by a type of shapes S and, for each shape s, a type of positions P(s). A value of the container is a shape together with a function from its positions to the stored values. A table with a ragged set of keys fits this exactly. The shape is which keys are present, and the positions are those keys.

The useful result from that paper here is about maps between containers. Every polymorphic function from one container to another, i.e., every natural transformation between the two, is given by two pieces. The first piece maps input shapes to output shapes. The second piece maps each output position back to an input position. The second piece points backward, from output to input. This is Hannah's ξ, which points from graphic to data. So her claim that structure-preserving artists come with a map ξ from the graphic back to the data is, for containers, a theorem about all polymorphic functions, and it needs no extra assumption.

A **Naperian functor** (Gibbons, ["APLicative programming with Naperian functors"](https://www.cs.ox.ac.uk/jeremy.gibbons/publications/aplicative.pdf), ESOP 2017) is a container with one shape, so it is the same as a function from a fixed position type. Dense arrays (Dex tables, xarray arrays, a `table` over a product of declared domains) are Naperian. Ragged tables (species differ per lake) are containers but not Naperian. This is the type-theoretic form of the difference between product keys and dependent keys in Section 4.3.

### 1.5 What the categorical version buys, and whether it is a good reason

I looked for something that the categorical form gives GoFish and the type-theoretic form does not. These are the candidates.

- **Gluing and locality.** These axioms describe a data container that stores pieces of a dataset in different places. GoFish holds its data in memory as lists, so the container question does not come up. The finite content that remains is about grouping. A grouping is a relation between rows and keys. When that relation is a total function (each row has exactly one key), the groups partition the rows, and gluing them back is trivial. This is Lenz and Shoshani's disjointness and completeness, and it can be stated with no sheaf. The sheaf axioms say something more only for covers whose pieces overlap, e.g., rolling windows, multi-valued tag columns, or regions such as service areas that overlap. For those, gluing requires that sections agree on overlaps, and summing an `Extensive` value over an overlapping cover counts the overlap twice. GoFish has no operator over overlapping covers, so I would not build this.
- **Naturality as an axiom.** In the categorical version an artist must be checked to be natural. In type theory, parametricity makes every function with a polymorphic type natural, with no check, as Section 1.6 explains. This is an advantage of the type-theoretic form. It comes with a caveat. TypeScript does not enforce parametricity, so a GoFish operator can read `String(key)` even when its type says it should not. Parametricity then becomes a rule for operator authors plus a property test, which is what Hannah's verification by measurement already is.
- **Pushforward and pullback of sheaves along ξ.** In type theory, pulling data back along ξ is composition, τ ∘ ξ. Pushing forward along ξ is the dependent product (or sum) over the fibers of ξ. Lawvere showed that these quantifiers are the adjoints to substitution, Σ_f ⊣ f\* ⊣ Π_f, so type theory already has them, under the names Σ, substitution, and Π.
- **Topology for continuous keys.** GoFish data is finite, and finite topologies are preorders (Section 1.3). A continuous key such as time is sampled, so what a line needs is a claim that values between samples mean something. A trait expresses that claim (Section 4.1).
- **Dependent keys that change along an edge.** A ribbon between stacked bars across lakes needs, for each pair of neighboring lakes, a way to match the species in one lake to the species in the next. Categorically, this is a functor from the neighbor graph's paths to sets. In type theory it is a type family B(k) with a function from B(k) to B(k') for each edge from k to k'. GoFish only ever needs the case where all the B(k) are subsets of one species type and the matching is "same name", so neither form adds anything for now.
- **Vocabulary.** Spivak's three migrations Δ, Σ and Π name reindexing, aggregation and joining with one scheme. This is useful as a way to organize the operator table, and the type-theoretic names (substitution, Σ, Π) cover the same ground.

My conclusion is that none of these is a very strong reason to use category theory in GoFish's account. The categorical model is a reasonable semantics to cite for the whole system. The account users and implementers read should be type-theoretic. Two of Hannah's ideas carry over directly and are worth keeping.

- **ξ as an invariant.** Every drawn node should know its key, so that the picture maps back to the data. GoFish already does most of this (`node.setKey`, `keyCell`, `keyBy` in `createOperator.ts`).
- **Measurement tests.** Change the data by an allowed transformation, render, measure the marks, and compare with the predicted change. This is how to test an operator's typing rule.

### 1.6 Parametricity as the type-theoretic form of equivariance

Reynolds' ["Types, abstraction and parametric polymorphism"](https://people.mpi-sws.org/~dreyer/tor/papers/reynolds.pdf) (1983) and Wadler's ["Theorems for free!"](https://doi.org/10.1145/99370.99404) (1989) show that a function whose type is polymorphic in a type variable cannot inspect values of that type, and so it satisfies an equation that follows from its type alone. Such an equation is called a free theorem. For a function f of type ∀K. F(K) → G(K), the free theorem says that for every function h from K to K', G(h) ∘ f = f ∘ F(h). In words, f commutes with relabeling.

Wadler's Section 3.4 treats type class constraints, which are GoFish traits. When the type variable carries a constraint, the free theorem holds only for relabelings that preserve the constraint's operations. This gives the statement Josh asked for, in a form with a precise condition.

> An operator whose type is polymorphic in the key type, with trait bounds T on the key, cannot inspect keys beyond what T provides. So it commutes with every relabeling of keys that preserves T.

The trait bound fixes which relabelings count. Each key trait then corresponds to a group of allowed relabelings, which is how measurement theory defines a scale type (Stevens).

| Key trait bound      | Relabelings the operator commutes with | Consequence                                                               |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| identity only (`Eq`) | any one-to-one renaming                | Renaming a species moves nothing except the label.                        |
| `HasOrder`           | renamings that keep the order          | The slot order is fixed, and reversing the order needs `.reverse()`.      |
| `HasCycle`           | rotations of the cycle                 | Starting the year in July rotates a polar chart and changes nothing else. |
| `HasParent`          | renamings that keep the parent map     | Renaming a parent keeps the tree.                                         |
| `HasRegion`          | maps that move the regions as a group  | Changing a map projection moves every region the same way.                |

Kennedy proved the same kind of result for units of measure, where the allowed changes are rescalings, in ["Relational parametricity and units of measure"](https://doi.org/10.1145/263699.263761) (POPL 1997). The draft already cites Kennedy for units, so citing parametricity for keys keeps the system uniform. Bernardy, Jansson and Paterson, ["Parametricity and dependent types"](https://doi.org/10.1145/1863543.1863592) (ICFP 2010) extend the theorem to dependent types, which covers dependent keys.

One finding came out of this. GoFish orders nominal keys by first appearance in the rows (`splitEntries`), so reordering rows reorders slots. This does not break the free theorem, because the row order is part of the input, and renaming keys still commutes with layout. It does mean that a nominal key gets an order from the data without saying so. Kindlmann and Scheidegger's "representation invariance" would call a picture that changes under a reordering of an unordered set a failure. In GoFish this behavior is deliberate, since users control order through the data. The type-theoretic reading is that `spread` over a nominal key gives the key an order by first appearance, and the docs could state it as that default.

## 2. Other typed precedent for key spaces

Each entry gives the model, its names, and what transfers to GoFish.

- **Dex** (Paszke et al., ["Getting to the Point: Index Sets and Parallelism-Preserving Autodiff for Pointful Array Programming"](https://arxiv.org/abs/2104.05372), ICFP 2021). An array is a table, written `n=>a`, from an index set `n` to values `a`, and `for i. e` builds one. An index set is any type with an `Ix` instance, which provides its size and a numbering of its elements. Products, sums, records and ranges of index sets are index sets, and an index set may depend on an earlier index, e.g., the lower triangle `(i:n)=>(..i)=>Float`. What transfers is the idea that keys are types with a small required interface, and that dependent keys are dependent index sets. Dex requires every index set to be finite and enumerable. GoFish needs the same, since every key it splits on comes from data or a declared domain.
- **Spivak**, ["Simplicial Databases"](https://arxiv.org/abs/0904.2012) (2009) and ["Functorial Data Migration"](https://arxiv.org/abs/1009.1166) (2012). A schema is a category whose objects are tables and whose arrows are foreign keys. An instance is a functor from the schema to sets. Moving data along a map of schemas uses three operations, Δ (reindex by precomposition), Σ (push forward by union, which is how aggregation looks), and Π (push forward by all compatible tuples, which is a join). What transfers is motivation and naming. A foreign key is a function between key types, and Section 4.6 uses this directly.
- **Kennedy's units of measure** ([Kennedy 2009](https://doi.org/10.1007/978-3-642-17685-2_8), and the POPL 1997 paper above). Units form an abelian group, and inference uses unification in that group. What transfers is the parametricity argument (Section 1.6) and the approach of gradual checking. GoFish already has gradual units, so it can treat key traits the same way, where a key with no declared traits is allowed and checks that need a trait report it.
- **Row types** (Wand, "Complete type inference for simple objects", LICS 1987; Rémy, "Type checking records and variants in a natural extension of ML", POPL 1989). A record type may be open, with a row variable that stands for the other fields. What transfers is that an operator such as `spread({ by: "lake" })` needs only "the rows have a field `lake`", which is an open row. The key columns and the value columns of a table are two disjoint rows.
- **xarray and pandas** (Hoyer and Hamman, ["xarray: N-D labeled arrays and datasets in Python"](https://doi.org/10.5334/jors.148), 2017; [xarray terminology](https://docs.xarray.dev/en/stable/user-guide/terminology.html); [pandas MultiIndex](https://pandas.pydata.org/docs/user_guide/advanced.html)). xarray names each dimension of an array. A dimension coordinate labels the positions along a dimension. A non-dimension coordinate is another array indexed by one or more dimensions, e.g., the latitude of each station. A pandas MultiIndex is a key made of a tuple of levels. What transfers is the vocabulary. Key components are dimensions. A region attached to a key, e.g., a state's outline or a cell's interval, is a non-dimension coordinate, i.e., a function from the key to geometry. xarray arrays are dense products, so xarray has no dependent keys, and ragged data has to be padded. pandas `stack`/`unstack` is the long versus wide question the draft defers.
- **Named Tensor Notation** (Chiang, Rush and Barak, ["Named Tensor Notation"](https://arxiv.org/abs/2102.13196), TMLR 2023). Each axis of a tensor has a name, and a reduction says which named axis it reduces over, e.g., a sum over `seq`. Operations broadcast over the axes they do not name. What transfers is that an aggregate names the key it folds over. The additivity kind is then a property of the pair of a value and that named axis, which is exactly the draft's `Extensive<k>`.
- **OLAP summarizability** (Lenz and Shoshani, ["Summarizability in OLAP and statistical databases"](https://doi.org/10.1109/SSDM.1997.621175), SSDBM 1997; Hurtado and Mendelzon, "Reasoning about summarizability in heterogeneous multidimensional schemas", ICDT 2001; Hurtado, Gutierrez and Mendelzon, ["Capturing summarizability with integrity constraints in OLAP"](https://doi.org/10.1145/1071610.1071613), TODS 2005). A dimension is a hierarchy of levels (day, month, year). A hierarchy is strict when each member has one parent and covering when each member has a parent at each level above. Summing up a hierarchy is correct only when it is strict and covering and the measure suits the aggregate. Hurtado and Mendelzon handle heterogeneous dimensions, where some members skip a level, e.g., a country with no states, and give dimension constraints that say which paths exist. What transfers is that `HasParent` keys need these checks before a sum moves up a level, and that heterogeneous hierarchies are dependent keys. I would defer the heterogeneous case (Section 5).
- **SQL keys and functional dependencies** (Codd 1970; Armstrong 1974). A functional dependency X → Y says that rows that agree on X agree on Y. A candidate key is a set of columns on which every column depends. A foreign key is an inclusion dependency, i.e., every value in the referencing column appears as a key of the other table. What transfers is that "a table is a function from keys to records" is the statement that the declared key is a candidate key. A dependency inside a key, e.g., county → state, is a coarsening map, which is `HasParent`. The BI literature names the error of summing a value that a many-to-one join copied the "fan trap", and Section 4.6 turns it into a type error.
- **Tidy data** (Wickham, ["Tidy Data"](https://doi.org/10.18637/jss.v059.i10), JSS 2014). Each variable is a column, each observation is a row, and each type of observational unit is a table. Wickham separates fixed variables, which describe the design of the experiment, from measured variables. What transfers is the split of columns into key columns and value columns, and the rule that a second type of unit (lakes versus catches) is a second table, which leads to foreign keys.
- **Bertin** (Semiology of Graphics, 1967). Bertin calls the varying concepts of a dataset its components and the common concept they describe the invariant. He classifies each component by its length (number of categories) and its level of organization (qualitative, ordered, quantitative). He gives the two plane dimensions to the components that matter most. A map is the case where one component has a geographic order, and a network is the case where the relations among elements of one component are the data. What transfers is that a key with a region (a map) and a key with neighbors (a network) are kinds of component, not kinds of value.
- **Munzner** (Visualization Analysis and Design, 2014, chapters 2 and 7; the talk "Marks Revisited: Beyond Bertin", [video](https://www.youtube.com/watch?v=hdCSWQqKVSY)). A key is an attribute that indexes, and a value is an attribute that is looked up. A flat table has one key, and a multidimensional table has several. Chapter 7 arranges tables by the number of keys. Zero keys means expressing values (a scatter). One key means a list of separate, ordered, aligned regions. Two keys give a matrix, and many keys give recursive subdivision. "Marks Revisited" adds interlocking marks, e.g., the regions of a choropleth or a treemap, which cannot change size alone. What transfers is the count of keys as the first decision of a layout. GoFish already follows it, since `scatter` expresses values, `spread` is one key, `table` is two keys, and nested `by` is recursive subdivision. Interlocking marks are `HasRegion` keys placed by `partition`.
- **Kindlmann and Scheidegger** (["An Algebraic Process for Visualization Design"](https://doi.org/10.1109/TVCG.2014.2346325), TVCG 2014). A visualization is good when a change to the data (α) and the matching change to the picture (ω) commute with the rendering. Their principles are representation invariance (changing how the same data is stored leaves the picture unchanged), unambiguous depiction, and correspondence between data changes and visual changes. What transfers is the set of tests. Representation invariance is the free theorem for key relabelings, and correspondence is the free theorem for value transformations.
- **Mackinlay** (["Automating the design of graphical presentations of relational information"](https://doi.org/10.1145/22949.22950), TOG 1986). Expressiveness asks that a picture state all the facts of the data and only those facts. Mackinlay requires a structure-preserving map (a homomorphism) from the data's relations to the picture's relations. What transfers is the precise version of "a ribbon asserts continuity". A ribbon states a neighbor relation, and expressiveness forbids stating a relation the key type does not have.
- **Wilkinson's algebra and Polaris** (Wilkinson, The Grammar of Graphics, 2005; Stolte, Tang and Hanrahan, ["Polaris"](https://doi.org/10.1109/2945.981851), TVCG 2002). Wilkinson has three operators on variables. Cross (A \* B) gives all pairs, nest (A / B) gives B within A, and blend (A + B) gives a union. Polaris's table algebra has concatenation, cross and nest, and its nest keeps only the pairs that occur in the data. What transfers is a direct precedent for product versus dependent keys. Cross is the product K₁ × K₂. Nest is the dependent pair Σ(a : A). B(a), where B(a) is the set of b that occur with a. Blend is a sum type.
- **Bettini, Jajodia and Wang**, Time Granularities in Databases, Data Mining, and Temporal Reasoning (2000). A granularity is a map from labels to granules of time that do not overlap. The book separates "finer than" from "groups into", which is why weeks do not nest in months. This is already the basis of GoFish's calendar cells, and it is a precedent for `HasParent` being partial.

## 3. How GoFish treats keys today

This section records what the code and docs do now, so the proposal can build on it.

- **Every split has a key.** `splitEntries` (`ast/datumProjection.ts`) groups the rows by `by` and returns `SplitGroups`, a map from `SplitKey` to the rows of each group, with an optional `hasOrder` flag. A `SplitKey` is a string, a number, or a `KeyCell`. With no `by`, the split is by row identity (`chunk(1)`), and the nodes are marked `_syntheticKey`, so no axis shows them. `spread`, `stack`, `group`, `scatter`, `table`, `treemap` and `partition` all split this way.
- **Keys live on nodes.** `createOperator` gives each node its local key (`node.setKey`), the cell it came from (`keyCell`), the `by` that made it (`keyBy`), and the field name (`__splitBy`) that `resolve` reads. Since #606 these keys are local to their level, so species under a lake are keyed `"Bass"`, not `"Lake A-Bass"`. The path of keys from the root to a node is the key context Δ that Section 4.2 defines. The `keyContext` that CLAUDE.md lists does not exist in the source today, since the keys are on the nodes.
- **Key traits that exist.**
  - `HasLevels` comes from `Domain.discrete`. It fixes the order of groups, but empty levels are not kept as groups.
  - `HasOrder` comes from `Trait.ordered` and marks the groups as ordered.
  - `HasMidpoint` comes from `Trait.diverging` and sets a stack's origin.
  - `HasCycle` exists for calendar parts, e.g., `field(d).bin(Calendar.month)`, with every part present in order.
  - The phantom flag `hasRegion` on `FieldExpr<true>` and `StructExpr<true>` says that a key has a region, and `partition` requires it.
  - `KeyCell.parent` records the coarser cell in a chain of bins.
- **Product versus dependent keys today.** Binned keys are products, because the cells come from the column's whole domain, so every group of a nested split sees the same cells and empty cells are kept. Keys with declared levels are ordered but sparse, because each group keeps only the levels it has. Keys with neither are dependent, because each group gets the values that occur in it, in order of first appearance. Issue #48's open question 4 asks whether `spread` over cells should keep empty cells, which is the same question.
- **Additivity today.** `CanSum` is a trait of a unit, and the stack fold and the size channel check it (`measure.ts`). It is per unit, not per pair of a unit and a key, so GoFish cannot yet say that inventory adds over warehouses but not over months.
- **Neighbors today.** A fused `line` or `ribbon` connects its siblings in flow order along a travel axis (`chartBuilder.ts`, issue #752). Nothing checks whether the key it travels along has neighbors. `HasCycle` is known for calendar parts, but closing the gap in polar space is still TODO #1052.
- **Names.** `.name("bars")` under a `spread` registers one node per cell, and `selectAll("bars")` gathers them, so a name repeated by a split is plural. Each node keeps its key and datum, so `chart(selectAll("bars")).flow(group({ by }))` can split them again.
- **Multi-table.** `join(right, { on })` is a one-to-many inner join, so each left row becomes one output row per matching right row. `resolve` relates data to the drawn nodes of an earlier layer.
- **GoTree.** `packages/gofish-gotree` reads a tree from `children` arrays through d3-hierarchy and builds the layout by recursion over the tree, with links from each node to its parent.
- **Cells (#48).** The proposal on #48, which Josh liked but did not sign off, describes a cell system as five parts. The parts are an ID, a map from a point to its cell, a map from a cell to its geometry, an optional order, and an optional coarsening. It also says that cell is a refinement of region, and that the first step needs only "the key has a region".

The existing design already treats keys as typed values with traits. The proposal below mostly names and connects what exists.

## 4. Proposal: a small account of the key space

### 4.1 Key types and key traits

A **key type** is a finite set of values with equality. Every `by` gives one, and every key also has the row identity under it. A key type has traits that say how its values relate. The traits form a lattice of refinements, where a trait may imply others, and new traits can be added. They are not a closed list of kinds.

```
                     key (identity only)
                    /                  \
            HasNeighbors             HasRegion
          /      |       \               |
    HasOrder  HasCycle  HasParent     (cell: regions that do not
        |                              overlap and cover; deferred)
    (continuous: derived from a continuous column)
```

- **(no trait).** Keys can be told apart and nothing more. Example: species. It allows bars and points, and it rejects connectors.
- **`HasNeighbors`.** There is a neighbor relation, a graph on the keys. It allows a connector (link, ribbon, a line read as connections) between neighbors. A general graph gets it from an edge table (Section 4.6). The other neighbor traits imply it.
- **`HasOrder`** (exists). Each key has a next key, so the neighbor graph is a path. It allows a sorted spread, a ribbon between consecutive groups, and a stack origin at a midpoint.
- **`HasCycle`** (exists for calendar parts). The order wraps, so the neighbor graph is a cycle. It does not imply `HasOrder`, since a cycle has no first element. It allows a closed line, a closed polar spread, and a radar polygon. Today it comes only from calendar parts. A `Trait.cyclic()` on declared levels, e.g., compass directions, would be the user-facing form, and it waits for an example.
- **`HasParent`.** Each key has at most one parent key in a coarser key type. Examples are a county's state, a month's year (`KeyCell.parent`), a node's parent in a GoTree, and each level of a nested `by`. It implies `HasNeighbors` (the tree edges). It allows links to the parent, and summing up a level when the hierarchy is strict and covering.
- **`HasRegion`** (exists as `hasRegion`). Each key has a region in a continuous space, e.g., an interval or a polygon. It is independent of the neighbor traits, since states have regions and no order. `partition` requires it.
- **Cell** (a refinement of `HasRegion`, deferred as #48 says). The regions do not overlap and they cover a domain. It allows a function from a point to its cell, summing over cells, and neighbors derived from shared borders.
- **Continuous** (derived, with no declaration). A key over a column whose values are points of a continuous unit, e.g., numbers or instants, or cells of a line, has `HasOrder`. It also allows reading values between neighbors. That allows smooth curves, resampling a line into an arc under polar coordinates, and areas. I would not give it a trait name until an example forces one, since it follows from the column type.
- **Grid.** A grid is not a separate trait. It is the product K₁ × K₂ of two keys with neighbors, and the neighbor graph of a product is the product of the two graphs.

Here is how each trait is tested on a hard example.

- **Radar chart over unordered attributes** (speed, armor, range, cost). The polygon's area depends on the order of the axes, which the attributes do not have. The type error reads "a closed line over `attribute` needs `HasCycle`, and `attribute` has no order. Use bars, or declare an order and a cycle."
- **Smooth curve over Likert levels.** `line({ curve: Curve.monotone() })` over a key with `HasOrder` that is not continuous draws values between "agree" and "strongly agree", where there are none. The lint reads "a smooth curve reads values between keys, and `response` has no values between its levels."
- **Months in polar coordinates.** `spread` over `field(d).bin(Calendar.month)` under `Coord.clock()` has a key with `HasCycle`. The default leaves the same gap between December and January as between other months (#1052).
- **Ribbons between lakes** (the PyData example). The key `lake` has no trait, so the ribbon is an error unless the data says how lakes connect. "Lakes along one river" is `HasOrder`. "Lakes joined by channels" is `HasNeighbors` from an edge table.
- **Choropleth with an unbinned state column.** `partition({ by: "state" })` needs `HasRegion`, which comes from joining a table of state shapes (Section 4.6). Without it, the error is the one `partition` gives today.

### 4.2 The key context and the typing judgment

**Notation.** Each column v has a source key K_v, the key of the table it came from. When the user declares a table key (the draft's `key: { warehouse, month }`), K_v is that key. Otherwise K_v is the row identity. The key context Δ at a point in the pipeline is a telescope of keys, k₁ : K₁, k₂ : K₂(k₁), and so on, where each key type may depend on the keys before it. The rows that reach a node are the rows whose keys match the node's path, i.e., the group at Δ. The judgment

```
Δ ⊢ op ⇒ Δ'
```

says that the operator `op`, run in context Δ, hands its children the context Δ'. A requirement written "needs" is a trait constraint, solved the way Rust resolves trait bounds. When it fails, the error names the trait.

**Splits.** Every operator that takes `by` extends the context by one key.

```
Δ ⊢ split(by: f) ⇒ Δ, k : K_f(Δ)
```

Here K_f(Δ) is the set of values of f on the group at Δ, which is a dependent key. When f declares its domain, e.g., cells from `.bin`, or levels if Section 4.3's change is made, K_f(Δ) is that whole domain for every Δ, so the key is a product. The split has two side conditions, and they are summarizability conditions 1 and 2.

- **Disjoint.** Each row has at most one key. A column value is one value, so this holds for every `by` over a column or a function of a row. It fails only for covers that overlap, e.g., a multi-valued tags column or overlapping regions, and GoFish has no such `by` today. Bins and cells do not overlap by construction (#48).
- **Complete.** Each row has a key. This fails exactly when f is null on some row, or when a value falls outside a declared domain. GoFish already throws for values outside levels and cells. A null key is the remaining case, and there are two honest options, a loud error or a null group that is shown as such, with `dropNulls()` as the explicit way out. Today a null becomes a group key, which then shows as a category with no label.

So the "disjoint and complete" check that the draft asks for costs almost nothing for column keys. The check matters only for keys that bring their own cover (cells, regions, hierarchies from another table), and #48 already decided that those are declared, not checked.

**How each operator uses its key.**

| Operator                          | Context it hands children | Needs                                                           | Default it supplies                                                   |
| --------------------------------- | ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `spread({ by: k })`               | Δ, k                      | nothing                                                         | closing gap if `HasCycle` under polar; sorted slots if `HasOrder`     |
| `stack({ by: k })` on value v     | Δ, k                      | v is `Extensive` over k, and v has a zero                       | axis has a meaningful zero; origin at midpoint if `HasMidpoint`       |
| `treemap({ by: k, size })`        | Δ, k                      | size is `Extensive` over k                                      |                                                                       |
| `table({ by: { x: k₁, y: k₂ } })` | Δ, k₁, k₂                 | nothing                                                         | dependent k₂ is completed to the product with empty cells             |
| `partition({ by: k })`            | Δ, k                      | `HasRegion` on k                                                |                                                                       |
| `scatter({ by: k, x, y })`        | Δ, k                      | nothing on k; x and y are values                                |                                                                       |
| `group({ by: k })`                | Δ, k                      | nothing                                                         |                                                                       |
| no `by`                           | Δ, row                    | nothing                                                         |                                                                       |
| `line`/`ribbon` traveling along k | Δ unchanged               | `HasNeighbors` on k, with sibling order equal to neighbor order | closes the loop if `HasCycle`; fills missing inner keys (Section 4.3) |
| `join(right, { on })`             | Section 4.6               | `on` is a foreign key                                           |                                                                       |
| `derive(fn)`                      | unknown                   | nothing                                                         | checks after it become lints                                          |
| `filter`                          | Δ                         | nothing                                                         |                                                                       |

`derive` takes an arbitrary function, so the checker cannot know what it does to keys. Following the gradual approach GoFish uses for units, the key context after `derive` is unknown, and any check that needs it is skipped. A typed replacement for a common `derive` (e.g., `field(...).normalize()`) keeps the context.

**Where the additivity lookup reads Δ.** This answers deferred question 5. There are two places that add values.

1. **Adding operators.** `stack({ by: k })` and `treemap({ by: k })` add their children's values over k. The lookup is kind(v, k), where v is the stacked or sized value.
2. **Channel aggregates.** A channel such as `rect({ h: "stock" })` at context Δ folds the rows in its group. Those rows differ only in the components of v's source key K_v that Δ has not fixed. Call those components the residual R = K_v minus Δ. The aggregate must suit kind(v, r) for every r in R. A sum needs `Extensive` over every r. When R is empty, there is one row and no fold. When R includes a component that v does not depend on, the fold copies a value, which is the `Constant` case in Section 4.6.

Kinds are declared against key dimensions, and a key computed from a dimension inherits the dimension's kind. A key such as `field("date").bin(Calendar.month)` is a coarsening of `date`, so kind(v, month cell) is kind(v, date). This keeps declarations short, since a user declares `stock` as `Cumulative<date>` once, and every binning of `date` inherits it.

**Example: inventory snapshots by month.** The table is keyed by `warehouse × day`, and `stock` is `Cumulative<day> & Extensive<warehouse>`. The spec is `chart(inv).flow(spread({ by: field("day").bin(Calendar.month) }), stack({ by: "warehouse" })).mark(rect({ h: "stock" }))`.

- `spread` sets Δ = (month).
- `stack` adds `warehouse` and checks kind(stock, warehouse), which is `Extensive`. It passes.
- At the mark, Δ = (month, warehouse) and R = {day}. kind(stock, day) is `Cumulative`. A sum is an error, and the default aggregate becomes the last value in the cell (or the time average if the user asks).
- Today GoFish sums the daily snapshots, which is wrong by a factor of about 30. The draft's example misses this case because its table is already monthly.

**Example: the draft's error case.** `spread({ by: "warehouse" })` and then `stack({ by: "month" })` with `h: "stock"` asks for kind(stock, month), which is `Cumulative`, so the error is "stock is cumulative over month, so stacking it would count the same items once per month."

**Names carry their key context.** A mark named `.name("bars")` at context Δ is a family of nodes indexed by Δ. `selectAll("bars")` returns that family with each node's key, so a later chart can split it again by any key in Δ. For example, `chart(selectAll("bars")).flow(group({ by: "species" })).mark(ribbon())` over bars made at Δ = (lake, species) gives, for each species, a chain over `lake`. The ribbon then needs `HasNeighbors` on `lake`. This check needs no new mechanism, since nodes already keep `keyBy`.

### 4.3 Product keys and dependent keys

After `spread({ by: "lake" })` and `stack({ by: "species" })`, the key is either the product Lake × Species or the dependent pair Σ(lake : Lake). Species(lake), where Species(lake) is the set of species found in that lake. The difference changes what can be drawn.

- **Stacked bars** work either way.
- **`table`** needs the product, because columns line up across rows. Over a dependent key, `table` fills the missing pairs with empty cells. An empty cell draws nothing, so this is correct for any value kind.
- **Ribbons between stacks, and stacked areas,** pair (lake, s) with (next lake, s). With a product key every pair exists. With a dependent key some species are missing in some lakes, and the value kind decides what a missing pair means.
  - If v is `Extensive` and has a zero, a missing pair is zero. The default fills it, and the ribbon narrows to zero, e.g., a streamgraph of counts per genre per year with some genre absent in some years.
  - Otherwise a missing pair is unknown, and filling it with zero is a lie. The ribbon or line breaks there and shows a gap. For example, an average ticket price per genre per year is `Intensive`, and drawing it to zero in a year with no data is wrong. Today GoFish has no rule for this.

This one rule links key completion to additivity, and it removes a choice users get wrong. GoFish has a related inconsistency today. Cells are product keys with empty groups kept, while declared levels are ordered but keep only the levels present. I suggest that declared levels behave like cells, i.e., a declared domain makes the key a product, because a declared domain says which values exist. That is #48's open question 4, and the rule above answers it for every value kind, since empty groups draw nothing for bars and draw zero or a gap for connectors.

### 4.4 Keys and values in graphical space

This answers deferred question 1. The draft's first guess was that "keys become positions and the identity of marks, values become extents and channels", and that spread and stack blur the line. The proposed statement is this.

> The key always gives a mark its identity. For each axis, a mark's position comes from its key or from a value, and so does its size.

The operators differ in where each one comes from.

| Operator    | Identity | Position along its axis                 | Size along its axis |
| ----------- | -------- | --------------------------------------- | ------------------- |
| `spread`    | key      | key (a slot in order)                   | value, or own size  |
| `table`     | key      | key (grid row and column)               | key (grid cell)     |
| `partition` | key      | key (its region on a shared scale)      | key (its region)    |
| `scatter`   | key      | value (a statistic of the group)        | value, or own size  |
| `stack`     | key      | running sum of values over earlier keys | value               |
| `treemap`   | key      | the tiling algorithm, from values       | value (area)        |

In Hannah's terms, the key picks the part of the graphic, ξ⁻¹(k), that shows record k, and the operator chooses whether that part's place comes from k or from τ(k).

`stack` is the only operator that turns a key into a position by adding values. Its children's positions are partial sums of values taken in key order. That is why `stack` needs the value to be `Extensive` over its key, and nothing else does. `spread` gives each key its own space, so values in different slots are never added. `stack` puts all keys in one space, so values along the key are added. This matches Josh's correction that `stack` glues its children's spaces into one and `spread` keeps them separate. `treemap` is the 2D case, where areas add up to the parent's area. A side effect is that the order of keys in a stack is arbitrary for a nominal key. The total does not depend on the order, but each segment's position does, so a reader should compare segment lengths, not segment positions.

**The statement checked against ten charts.**

1. **Bar chart.** The key is `category`, and `spread` maps it to slots. The value `h` gives the size. At the mark, R is the row identity, and summing needs `Extensive` over rows, which is the usual case for counts and sales. For price, the default is a weighted mean.
2. **Stacked bar.** `spread({ by: month })` then `stack({ by: warehouse })`. Month positions bars, and warehouse positions segments by a running sum, so `Extensive<warehouse>` is required.
3. **Scatter.** The key is the row, used only for identity. Both positions are values. With `scatter({ by: species, x, y })`, the position is the mean of each group, which is valid for affine values.
4. **Heatmap.** `table({ by: { x: hour, y: day } })`. The key is a product, and a grid of two `HasOrder` keys, and `hour` has `HasCycle`. Position and size come from the key, and color is a value. Color does not add, so an `Intensive` color is fine. A `sum` in each cell needs `Extensive` over the residual.
5. **Treemap.** `treemap({ by: category, size })`. Size must be `Extensive` over `category`, because tile areas add up to the whole. A treemap of average price per category is an error, "treemap sizes add up to the parent's area, and `price` is intensive over `category`".
6. **Mosaic (Marimekko).** Widths are counts per A, which are `Extensive<A>`. Inside each column, the heights are `normalize`d shares of B given A. A share is `Extensive` over B within A and adds to 1, i.e., it is `Bounded[0,1]`. So both stacks pass, and the rule explains why `normalize` must come before the inner stack.
7. **Line and area.** The key is time, which is continuous, so it has `HasOrder` and allows values between samples. The line connects neighbors. An area is a ribbon from the zero baseline, so the value must have a zero, the same check as a bar.
8. **Ribbon between stacks.** The outer key needs `HasNeighbors`, and the inner key must come from one shared type, and a missing pair follows Section 4.3. For the lakes, the error is "a ribbon between `lake` groups says lakes are connected, and `lake` has no neighbors. Declare an order or an edge table."
9. **Node-link tree.** Nodes are keyed by V, which has `HasParent`, either from `children` arrays as GoTree reads them or from a parent column. Links are keyed by the non-root nodes, and each link's endpoints are `ref(v)` and `ref(parent(v))`. Positions come from the tree layout, which is recursion over the parent relation. A filter that removes a parent leaves a link with a missing endpoint. That is a foreign key into a set that no longer contains the target, and the error says which node lost its parent.
10. **Choropleth.** The key is `state`, and `HasRegion` comes from a join with a shape table. Position and size come from the key's region. Fill is a value. Rolling county unemployment rates up to states groups by `state` over county rows. Then R = {county}, and the rate is `Intensive` with weight labor force, so the default is the weighted mean, and a plain sum or mean is an error. The map from county to state is `HasParent`, and counties are strict and covering under states, so sums of labor force also roll up correctly.

### 4.5 Trees, graphs and dependent keys

What fits now:

- **Nested `by`** gives a telescope Δ = (k₁, k₂(k₁), …), which is already a tree of groups. Sunburst, icicle and nested treemap are this case, and each adding level needs `Extensive` at that level.
- **Explicit trees** (GoTree, a parent column, bin chains) are keys with `HasParent`. Links use `ref` along the parent map.
- **Graphs** are a node table keyed by V and an edge table keyed by E, with two foreign keys src and dst from E to V. This is the usual type-theoretic presentation of a graph. The edge table gives V the trait `HasNeighbors`, and link marks use `ref(src(e))` and `ref(dst(e))`. An arc diagram, e.g., `spread` nodes and draw arcs from the edge table, type-checks with no new operator.
- **Dependent keys** are dependent pairs, with completion to the product decided by declared domains (Section 4.3).

What I would leave out:

- **Heterogeneous hierarchies,** where some members skip a level, e.g., countries with and without states. Summing them needs Hurtado and Mendelzon's dimension constraints. Wait until an example forces it.
- **Matching along an edge other than by name.** If species had to be matched across lakes by something other than equal names, the type family would need a function on each edge. No GoFish example needs it.
- **Covers that overlap,** e.g., rolling windows and overlapping service areas, which are where sheaf gluing says something.
- **Higher cell complexes** beyond 2D grids and polygon cells, e.g., meshes with edges and faces as keys.
- **Weighted crosswalks.** ZIP code areas do not nest in counties. A crosswalk is a weighted relation, not a function, and moving an `Extensive` value along it needs areal weights. Name it as an error ("ZIP to county is not a function") and defer the feature.

### 4.6 Multi-table inputs

The smallest useful thing is a foreign key, which is a function between key types, plus a rule for `join`.

- **Foreign key.** A column fk in table T₁, keyed by K₁, is a foreign key into table T₂, keyed by K₂, when fk is a function from K₁ to K₂ and every value it takes is a key of T₂. The second condition is referential integrity. It can be checked at render time, and a violation is the same error that `join` gives today when rows drop out, except that the type makes it loud.
- **Join along a foreign key is substitution.** `join(T₂, { on: fk })` gives each row of T₁ the record T₂(fk(k₁)). This is T₂ ∘ fk, Spivak's Δ, and the key context does not change. Each column of T₂ keeps its source key K₂.
- **Join on a column that is not a key of the right table adds a dependent key.** If many right rows share an `on` value, as in the pie glyph example where each lake has several catch rows, the join gives each left row a set of right rows. The context becomes Δ, j : Rows_T₂(on(k₁)). This is the same rule as `split`, so `join` is a `by` whose inner key comes from another table. In type-theory terms, the result is the pullback of the two key maps, Σ(k₁ : K₁). Σ(k₂ : K₂). on₁(k₁) = on₂(k₂).
- **The `Constant` kind.** After a join, a value from T₂ is the same on every row of T₁ that maps to the same K₂ key. A value v is `Constant` over a key component j when j is not part of v's source key K_v, so v does not vary along j. Summing over j copies the value once per row. A sum over a `Constant` component is an error, and the default aggregate is "the value", since it is the same on every row. This is the fan trap, and it gives the draft's list of kinds a fourth entry, with an answer to its open question about whether there are more kinds.

**Example: lake area after a join.** Start from catch rows keyed by `lake × species`. Join a lake table that has `area_km2` on `lake`. Then `spread({ by: "region" })` with `rect({ h: field("area_km2").sum() })` adds each lake's area once per species row. The type of `area_km2` is keyed by `lake`. At the mark, R = {lake, species}, and `area_km2` is `Constant` over `species`. The error reads "`area_km2` comes from the lakes table and does not vary by `species`. Summing it counts each lake once per species. Group by `lake` first, or use `field("area_km2").first()`."

**`join` versus `resolve`.** In this account, `join` follows a foreign key into data, and `resolve` follows one into drawn nodes. Both are substitution along a function between key types. The difference is whether the target is a table of records or a family of nodes that `.name` registered, and Section 4.2 gives that family a key context, so `resolve` can be typed the same way.

## 5. Open questions and what not to build yet

Open questions for Josh:

1. **Should declared levels be product keys?** Cells keep empty groups and declared levels do not. Section 4.3 suggests that declared levels keep empty groups too, with connectors filling zero or a gap according to the value's kind.
2. **Null keys.** Should a null `by` value be an error, a visible "missing" group, or stay as it is today, where it becomes an unlabeled group?
3. **Is `HasNeighbors` worth a name now,** or should connectors require `HasOrder` or `HasCycle` until an edge-table example arrives? The lakes example needs it if the lakes are not on one river.
4. **The continuous key.** I left it as a property derived from the column type. If a real example needs a declaration (e.g., an ordinal Likert scale the user wants to interpolate anyway), it would need a name.
5. **Where kinds are declared.** Should they be declared against key dimensions (`Cumulative<date>`) with coarsenings inheriting them, as Section 4.2 assumes, or against each key a `by` produces?
6. **`Constant` as a kind.** Is it a fourth kind next to `Extensive`, `Intensive` and `Cumulative`, or a fact the checker derives from source keys? I lean toward derived, since it follows from which table a column came from.
7. **Order of segments in a nominal stack.** The free theorem says segment positions in a stack over a nominal key depend on an arbitrary order. Should GoFish say this anywhere, e.g., in a lint for a label that reports a segment's position?
8. **The `hasRegion` flag.** Should the phantom flag be renamed to the trait `HasRegion`, so the type and the docs use one word?

What I would not build yet:

- Sheaf gluing or locality conditions, and any operator over covers that overlap.
- Cells as a refinement of regions, until coarsening sums or overlap rejection need it (#48 already says this).
- Heterogeneous hierarchies and their summarizability checks.
- Matching inner keys along edges by anything other than equal names.
- Weighted crosswalks between cell systems.
- A `Trait.cyclic()` for declared levels, until an example other than calendar parts needs it.
- A general graph layout operator. Graph keys only need the edge table and `ref`, and layout is a separate question.
- Long versus wide equality and sparse versus dense equality. The container view in Section 1.4 says a dense table is a function from its key and a sparse one is a container. A normal form is possible, but no example forces it yet.
- Any categorical machinery in the user-facing docs. Cite Hannah's model as the semantics, and write the rules in terms of traits and keys.

## Sources

- Aizenman, Vejdemo-Johansson, Caswell, Grossberg. [Mind Your νs and Qs](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf). GUGOG 2026.
- Same authors. [Categorical Framework for Visualization Software Architecture](https://ieeevis.org/year/2026/program/content/1057cc86-867a-44fb-a9e8-628ca96d9ace/), TopoInVis 2026, and the [expanded manuscript source](https://github.com/story645/team/tree/main/paper).
- [GUGOG 2026 accepted papers](https://gugog-vis.github.io/2026/papers.html).
- Matplotlib [data-prototype](https://github.com/matplotlib/data-prototype).
- Abbott, Altenkirch, Ghani. [Containers: constructing strictly positive types](https://doi.org/10.1016/j.tcs.2005.06.002). TCS 2005.
- Gibbons. [APLicative programming with Naperian functors](https://www.cs.ox.ac.uk/jeremy.gibbons/publications/aplicative.pdf). ESOP 2017.
- Paszke et al. [Getting to the Point](https://arxiv.org/abs/2104.05372). ICFP 2021.
- Reynolds. [Types, abstraction and parametric polymorphism](https://people.mpi-sws.org/~dreyer/tor/papers/reynolds.pdf). IFIP 1983.
- Wadler. [Theorems for free!](https://doi.org/10.1145/99370.99404) FPCA 1989.
- Bernardy, Jansson, Paterson. [Parametricity and dependent types](https://doi.org/10.1145/1863543.1863592). ICFP 2010.
- Kennedy. [Relational parametricity and units of measure](https://doi.org/10.1145/263699.263761). POPL 1997. Kennedy. [Types for units-of-measure: theory and practice](https://doi.org/10.1007/978-3-642-17685-2_8). CEFP 2009.
- Spivak. [Simplicial Databases](https://arxiv.org/abs/0904.2012), 2009. [Functorial Data Migration](https://arxiv.org/abs/1009.1166), 2012.
- Wand. Complete type inference for simple objects. LICS 1987. Rémy. Type checking records and variants in a natural extension of ML. POPL 1989.
- Hoyer, Hamman. [xarray](https://doi.org/10.5334/jors.148). JORS 2017. [xarray terminology](https://docs.xarray.dev/en/stable/user-guide/terminology.html). [pandas MultiIndex](https://pandas.pydata.org/docs/user_guide/advanced.html).
- Chiang, Rush, Barak. [Named Tensor Notation](https://arxiv.org/abs/2102.13196). TMLR 2023.
- Lenz, Shoshani. [Summarizability in OLAP and statistical databases](https://doi.org/10.1109/SSDM.1997.621175). SSDBM 1997.
- Hurtado, Mendelzon. Reasoning about summarizability in heterogeneous multidimensional schemas. ICDT 2001. Hurtado, Gutierrez, Mendelzon. [Capturing summarizability with integrity constraints in OLAP](https://doi.org/10.1145/1071610.1071613). TODS 2005.
- Wickham. [Tidy Data](https://doi.org/10.18637/jss.v059.i10). JSS 2014.
- Bertin. Semiology of Graphics. 1967 (English edition, ESRI Press 2010).
- Munzner. Visualization Analysis and Design. CRC Press 2014. [Marks Revisited: Beyond Bertin](https://www.youtube.com/watch?v=hdCSWQqKVSY) (talk).
- Kindlmann, Scheidegger. [An Algebraic Process for Visualization Design](https://doi.org/10.1109/TVCG.2014.2346325). TVCG 2014.
- Mackinlay. [Automating the design of graphical presentations of relational information](https://doi.org/10.1145/22949.22950). TOG 1986.
- Stolte, Tang, Hanrahan. [Polaris](https://doi.org/10.1109/2945.981851). TVCG 2002. Wilkinson. The Grammar of Graphics. Springer 2005.
- Bettini, Jajodia, Wang. Time Granularities in Databases, Data Mining, and Temporal Reasoning. Springer 2000.
- GoFish issue [#48](https://github.com/gofish-graphics/gofish-graphics/issues/48) and its comments. GoFish source and docs read: `ast/datumProjection.ts` (`splitEntries`, `SplitKey`), `ast/cells.ts`, `ast/marks/createOperator.ts`, `ast/marks/chartBuilder.ts`, `ast/measure.ts`, `packages/gofish-gotree/src`, `apps/docs/docs/internals/core/underlying-space.md`, `core/names-and-scoping.md`, `frontend/pipeline-types.md`, `design/api-design.md`, `js/api/operators/join.md`, `js/api/operators/treemap.md`.
