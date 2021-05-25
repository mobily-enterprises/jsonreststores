rm -rf ../docs/*;
# SHOULD CHANGE
echo "tpelements.com" > ../docs/CNAME

# Actually fully generate docs-src/codelabs/[id] directories by
# (1) Placing an index.md file with just the title
# (2) adding an index.md.head.html file which will effectively be
#     the full codelab
cd codelabs-src
for i in *md;do
  echo $i

  # Get the title and the ID from the code lab
  title=$(cat "$i" | grep "^summary:" | cut -d : -f 2)
  id=$(cat "$i" | grep "^id:" | cut -d : -f 2 | tr -d " ")

  # Create the codelab's HTML. This will write a file called 'index,html"
  # in docs-src/codelabs/[id] -- the name doesn't really work...
  claat export -f template.html -o ../codelabs "$i"
  # ...which is why it gets renamed to index.md.head.html
  mv "../codelabs/$id/index.html" "../codelabs/$id/index.md.head.html"

  # Copy the images over to the destination. Docco will only
  # ever copy the translated files and the theme files, never anything else
  mkdir -p "../../docs/codelabs/$id/img"
  cp -pr ../codelabs/"$id"/img/* "../../docs/codelabs/$id/img"



  # Make the main index file, with the right title
  echo "# $title" > "../codelabs/$id/index.md"
done
cd ..

# Copy TPE and TPE-material to the output folder
mkdir -p ../docs/lib
# SHOULD CHANGE
cp -pr ../distr/tpe-esm.js ../docs/lib/ 
cp -pr ../../tpe-material/distr/material-esm.js ../docs/lib/ 

# SHOULD CHANGE
# node --inspect-brk ../node_modules/docco-next/bin/docco \
../node_modules/docco-next/bin/docco \
  -p ./plugin.js\
  -c tpe.css\
  -t tpe.ejs\
  -o ../docs\
  index.md\
  documentation.md\
  codelabs.md\
  codelabs/how-to/index.md\
  code.md\
  code/mixins/*js\
  code/elements/*js

cp -r ./images ../docs/
# SHOULD CHANGE
cp -r ../distr/tpe-esm.js ../docs/lib
